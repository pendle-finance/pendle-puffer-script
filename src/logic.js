const {
  SY,
  LP,
  YT,
  MARKET_IFACE,
  MULTICALL_CONTRACT,
  LIQUID_LOCKERS,
  PENDLE_TREASURY,
  ZERO_ADDRESS,
} = require("./consts");
const { BigNumber } = require("ethers");
const { aggregateMulticall } = require("./multicall");

// in domination of yield token (pufETH)

const _1E18 = BigNumber.from(10).pow(18);

function increaseUserAmount(result, user, amount) {
  if (!result[user]) {
    result[user] = BigNumber.from(0);
  }
  result[user] = result[user].add(amount);
}

function applySyHoldersShares(result, allBalances) {
  const balances = allBalances.filter(
    (b) => b.token == SY && b.user != LP && b.user != YT
  );
  for (const b of balances) {
    increaseUserAmount(result, b.user, BigNumber.from(b.balance));
  }
}

function applyYtHolderShares(result, allBalances, allInterests, YTIndex) {
  const balances = allBalances.filter((b) => b.token == YT); // no exlude?
  const YTBalances = {};

  // 1 YT is receiving interest from
  for (const b of balances) {
    // result[b.user] = BigNumber.from(b.balance);
    const impliedBalance = BigNumber.from(b.balance).mul(_1E18).div(YTIndex);
    
    const feeShare = impliedBalance.mul(3).div(100);
    const remainingBalance = impliedBalance.sub(feeShare);

    increaseUserAmount(result, b.user, remainingBalance);
    increaseUserAmount(result, PENDLE_TREASURY, feeShare);

    YTBalances[b.user] = BigNumber.from(b.balance);
  }

  for (const i of allInterests) {
    if (i.user == YT || i.user == ZERO_ADDRESS) {
      continue;
    }
    if (i.userIndex == '0') {
      if (YTBalances[i.user].gt(0)) {
        throw new Error(`Pendle Fetcher: User ${i.user} has YT balance but no index`)
      }
      continue;
    }

    const pendingInterest = YTBalances[i.user]
      .mul(YTIndex.sub(i.userIndex))
      .mul(_1E18)
      .div(YTIndex.mul(i.userIndex));
    const totalInterest = pendingInterest.add(i.amount);
    increaseUserAmount(result, i.user, totalInterest);
  }
}

async function applyLpHolderShares(result, allBalances, blockNumber) {
  const totalSyForLP = allBalances.filter(
    (b) => b.token == SY && b.user == LP
  )[0].balance;

  const allLpHolders = allBalances
    .filter((b) => b.token == LP)
    .map((b) => b.user);

  const callDatas = allLpHolders.map((h) => {
    return {
      target: LP,
      callData: MARKET_IFACE.encodeFunctionData("activeBalance", [h]),
    };
  });

  const allActiveBalances = (
    await aggregateMulticall(callDatas, blockNumber)
  ).map((r) => BigNumber.from(r));
  const totalActiveBalance = allActiveBalances.reduce(
    (a, b) => a.add(b),
    BigNumber.from(0)
  );

  function processLiquidLocker(liquidLocker, totalBoostedSy) {
    const receiptToken = LIQUID_LOCKERS.filter(
      (l) => l.address == liquidLocker
    )[0].receiptToken;
    const receiptTokenBalance = allBalances.filter(
      (b) => b.token == receiptToken
    );

    let totalLiquidLockerShares = BigNumber.from(0);
    for (const b of receiptTokenBalance) {
      totalLiquidLockerShares = totalLiquidLockerShares.add(
        BigNumber.from(b.balance)
      );
    }

    for (const b of receiptTokenBalance) {
      const boostedSyBalance = totalBoostedSy
        .mul(BigNumber.from(b.balance))
        .div(totalLiquidLockerShares);
      increaseUserAmount(result, b.user, boostedSyBalance);
    }
  }

  for (let i = 0; i < allLpHolders.length; i++) {
    const holder = allLpHolders[i];
    const boostedSyBalance = allActiveBalances[i]
      .mul(totalSyForLP)
      .div(totalActiveBalance);

    if (isLiquidLocker(holder)) {
      processLiquidLocker(holder, boostedSyBalance);
    } else {
      increaseUserAmount(result, holder, boostedSyBalance);
    }
  }
}

function isLiquidLocker(a) {
  return LIQUID_LOCKERS.some((l) => l.address == a);
}

module.exports = {
  applySyHoldersShares,
  applyYtHolderShares,
  applyLpHolderShares,
};
