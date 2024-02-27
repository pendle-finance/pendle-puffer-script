const { request } = require("graphql-request");

async function fetchAll(endpoint, query, collection, variables = {}) {
    const datas = [];
    for(let synchingIndex = -1;;) {
        const resp = await request(endpoint, query, {...variables, synchingIndex});
        const batch = resp[collection];
        datas.push(...batch);
        if (batch.length < 1000) {
            break;
        }
        synchingIndex = parseInt(batch[batch.length - 1].synchingIndex);
    }
    return datas;
}

module.exports = {
    fetchAll,
    request
}