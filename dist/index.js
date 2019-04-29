const axios = require('axios');

function checkEnvironmentVariables(environmentVariables) {
  for (let environmentVariable of environmentVariables) {
    if (!process.env[environmentVariable]) {
      throw new Error(`Must set ${environmentVariable} environment variable`);
    } else {
      console.log(environmentVariable, process.env[environmentVariable]);
    }
  }
}

checkEnvironmentVariables(['ROBINHOOD_TOKEN', 'UPLOAD_ENDPOINT']);
const ROBINHOOD_TOKEN = process.env.ROBINHOOD_TOKEN || '';
const UPLOAD_ENDPOINT = process.env.UPLOAD_ENDPOINT || '';

axios.defaults.headers.common['Authorization'] = `Bearer ${ROBINHOOD_TOKEN}`;

async function getStockPositions() {
  const response = await axios.get('https://api.robinhood.com/positions/?nonzero=true');
  return response.data['results'].map(decodeStockPosition);
}

function decodeStockPosition(rawStockPosition) {
  return {
    account: rawStockPosition['account'],
    quantity: parseInt(rawStockPosition['quantity']),
    averageBuyPrice: parseFloat(rawStockPosition['average_buy_price']),
    instrument: rawStockPosition['instrument']
  };
}

async function getOptionPositions() {
  const response = await axios.get('https://api.robinhood.com/options/positions/?nonzero=True');
  return response.data['results'].map(decodeOptionPosition);
}

function decodeOptionPosition(optionPosition) {
  return {
    account: optionPosition['account'],
    averagePrice: parseFloat(optionPosition['average_price']),
    chainId: optionPosition['chain_id'],
    chainSymbol: optionPosition['chainSymbol'],
    id: optionPosition['id'],
    option: optionPosition['option'],
    quantity: parseInt(optionPosition['quantity']),
    type: optionPosition['type']
  };
}

function decodeInstrumentMarketData(rawInstrumentMarketData) {
  return {
    lastTradePrice: parseFloat(rawInstrumentMarketData['last_trade_price']),
    lastExtendedHoursTradePrice: parseFloat(rawInstrumentMarketData['last_extended_hours_trade_price']),
    symbol: rawInstrumentMarketData['symbol'],
    updatedAt: rawInstrumentMarketData['updated_at'],
    instrument: rawInstrumentMarketData['instrument']
  };
}

function decodeOptionMarketData(rawOptionMarketData) {
  return {
    adjustedMarkPrice: rawOptionMarketData['adjusted_mark_price'],
    breakEvenPrice: rawOptionMarketData['break_even_price'],
    instrument: rawOptionMarketData['instrument']
  };
}

async function getMarketData(instrumentUrls, type) {
  const pathComponent = {
    options: 'options',
    stocks: 'quotes'
  }[type];
  const response = await axios.get(`https://api.robinhood.com/marketdata/${pathComponent}/?instruments=${instrumentUrls.join(',')}`);

  if (type === 'options') {
    return response.data['results'].map(decodeOptionMarketData);
  }
  return response.data['results'].map(decodeInstrumentMarketData);
}

function decodeOption(rawOption) {
  return {
    chainId: rawOption['chain_id'],
    chainSymbol: rawOption['chain_symbol'],
    expirationDate: rawOption['expiration_date'],
    id: rawOption['id'],
    strikePrice: parseFloat(rawOption['strike_price']),
    type: rawOption['type'],
    url: rawOption['url']
  };
}

async function getOptions(ids) {
  const response = await axios.get(`https://api.robinhood.com/options/instruments/?ids=${ids.join(',')}`);
  return response.data['results'].map(decodeOption);
}

async function uploadPositions(body) {
  try {
    return await axios.post(UPLOAD_ENDPOINT, body);
  } catch (e) {
    console.log(e);
    throw e;
  }
}

async function getMarketDataForStockPositions(stockPositions) {
  const instrumentUrls = stockPositions.map(stockPosition => stockPosition.instrument);
  return await getMarketData(instrumentUrls, 'stocks');
}

async function getMarketDataForOptionPositions(optionPositions) {
  const optionUrls = optionPositions.map(optionPosition => optionPosition.option);
  return await getMarketData(optionUrls, 'options');
}

async function getOptionsForOptionPositions(optionPositions) {
  const ids = optionPositions.map(optionPosition => {
    const matchArray = optionPosition.option.match(/instruments\/(.*)\//);
    if (!matchArray || matchArray.length !== 2) {
      throw new Error(`Could not extract option id from option url: ${optionPosition.option}`);
    }
    return matchArray[1];
  });
  return await getOptions(ids);
}

async function getAndUploadPositions() {
  const stockPositions = await getStockPositions();
  const optionPositions = await getOptionPositions();
  const stockMarketData = await getMarketDataForStockPositions(stockPositions);
  const optionMarketData = await getMarketDataForOptionPositions(optionPositions);
  const options = await getOptionsForOptionPositions(optionPositions);
  await uploadPositions({
    positions: {
      stocks: stockPositions,
      options: optionPositions
    },
    marketData: {
      stocks: stockMarketData,
      options: optionMarketData
    },
    metadata: {
      options
    }
  });
}
getAndUploadPositions();
//# sourceMappingURL=index.js.map