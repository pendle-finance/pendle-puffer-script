const {
  SUBGRAPH_ENDPOINT,
  USER_BALANCE_QUERY,
  USER_PENDING_INTEREST_QUERY,
  YT_INDEX_QUERY,
  PENDLE_TREASURY,
} = require("./consts");
const {
  applyLpHolderShares,
  applyYtHolderShares,
  applySyHoldersShares,
} = require("./logic");
const { fetchAll } = require("./subgraph");
const { BigNumber } = require("ethers");

async function fetchUserBalanceSnapshot(blockNumber) {
  const result = {};
  const [allBalances, allInterests, indexes] = await Promise.all([
    fetchAll(
      SUBGRAPH_ENDPOINT,
      USER_BALANCE_QUERY.query,
      USER_BALANCE_QUERY.collection,
      { block: blockNumber }
    ),
    fetchAll(
      SUBGRAPH_ENDPOINT,
      USER_PENDING_INTEREST_QUERY.query,
      USER_PENDING_INTEREST_QUERY.collection,
      { block: blockNumber }
    ),
    fetchAll(
      SUBGRAPH_ENDPOINT,
      YT_INDEX_QUERY.query,
      YT_INDEX_QUERY.collection,
      { block: blockNumber }
    ),
  ]);

  applySyHoldersShares(result, allBalances);
  applyYtHolderShares(
    result,
    allBalances,
    allInterests,
    BigNumber.from(indexes[0].index)
  );
  await applyLpHolderShares(result, allBalances, blockNumber);

  let sum = BigNumber.from(0);
  for (const user in result) {
    sum = sum.add(result[user]);
  }
  return result;
}

async function main() {
  const BLOCK_NUMBER = 19318118;
  const res = await fetchUserBalanceSnapshot(BLOCK_NUMBER);
  for(let addr in res) {
    console.log(`${addr} : ${res[addr].toString()}`);
  }
}

main()
  .catch((err) => console.error(err))
  .then(() => process.exit(0));
