// @flow
const axios = require('axios');

function checkEnvironmentVariables(environmentVariables) {
  for (let environmentVariable of environmentVariables) {
    if (!process.env[environmentVariable]) {
      throw new Error(`Must set ${environmentVariable} environment variable`)
    } else {
      console.log(environmentVariable, process.env[environmentVariable]);
    }
  }
}

checkEnvironmentVariables(['ROBINHOOD_ACCESS_TOKEN', 'UPLOAD_ENDPOINT']);
const ROBINHOOD_ACCESS_TOKEN = process.env.ROBINHOOD_ACCESS_TOKEN || '';
const ROBINHOOD_REFRESH_TOKEN = process.env.ROBINHOOD_REFRESH_TOKEN || '';
const UPLOAD_ENDPOINT = process.env.UPLOAD_ENDPOINT || '';

axios.defaults.headers.common['Authorization'] = `Bearer ${ROBINHOOD_ACCESS_TOKEN}`;

type StockPosition = {
  account: string,
  quantity: number,
  averageBuyPrice: number,
  instrument: string,
};

async function getStockPositions(): Promise<StockPosition[]> {
  const response = await axios.get('https://api.robinhood.com/positions/?nonzero=true');
  return response.data['results'].map(decodeStockPosition);
}

function decodeStockPosition(rawStockPosition: Object): StockPosition {
  return {
    account: rawStockPosition['account'],
    quantity: parseInt(rawStockPosition['quantity']),
    averageBuyPrice: parseFloat(rawStockPosition['average_buy_price']),
    instrument: rawStockPosition['instrument'],
  };
}

type OptionPosition = {
  account: string,
  averagePrice: number,
  chainId: string,
  chainSymbol: string,
  id: string,
  option: string,
  quantity: number,
  type: string,
};

async function getOptionPositions(): Promise<OptionPosition[]> {
  const response = await axios.get('https://api.robinhood.com/options/positions/?nonzero=True');
  return response.data['results'].map(decodeOptionPosition);
}

function decodeOptionPosition(optionPosition: Object): OptionPosition {
  return {
    account: optionPosition['account'],
    averagePrice: parseFloat(optionPosition['average_price']),
    chainId: optionPosition['chain_id'],
    chainSymbol: optionPosition['chainSymbol'],
    id: optionPosition['id'],
    option: optionPosition['option'],
    quantity: parseInt(optionPosition['quantity']),
    type: optionPosition['type'],
  };
}

type OptionMarketData = {
  adjustedMarkPrice: number,
  breakEvenPrice: number,
  instrument: string,
};


function decodeInstrumentMarketData(rawInstrumentMarketData: Object): InstrumentMarketData {
  return {
    lastTradePrice: parseFloat(rawInstrumentMarketData['last_trade_price']),
    lastExtendedHoursTradePrice: parseFloat(rawInstrumentMarketData['last_extended_hours_trade_price']),
    symbol: rawInstrumentMarketData['symbol'],
    updatedAt: rawInstrumentMarketData['updated_at'],
    instrument: rawInstrumentMarketData['instrument'],
  };
}

function decodeOptionMarketData(rawOptionMarketData: Object): OptionMarketData {
  return {
    adjustedMarkPrice: rawOptionMarketData['adjusted_mark_price'],
    breakEvenPrice: rawOptionMarketData['break_even_price'],
    instrument: rawOptionMarketData['instrument'],
  };
}

type MarketDataType = 'options' | 'stocks'

async function getMarketData<T: InstrumentMarketData | OptionMarketData>(instrumentUrls: string[], type: MarketDataType): Promise<T[]> {
  const pathComponent = {
    options: 'options',
    stocks: 'quotes',
  }[type];
  const response = await axios.get(
    `https://api.robinhood.com/marketdata/${pathComponent}/?instruments=${instrumentUrls.join(',')}`,
  );

  if (type === 'options') {
    return response.data['results'].map(decodeOptionMarketData);
  }
  return response.data['results'].map(decodeInstrumentMarketData);
}

type InstrumentMarketData = {
  lastTradePrice: number,
  lastExtendedHoursTradePrice: number,
  symbol: string,
  updatedAt: string,
  instrument: string,
};


type Option = {
  chainId: string,
  chainSymbol: string,
  expirationDate: string,
  id: string,
  strikePrice: number,
  type: string,
  url: string,
};

function decodeOption(rawOption: Object): Option {
  return {
    chainId: rawOption['chain_id'],
    chainSymbol: rawOption['chain_symbol'],
    expirationDate: rawOption['expiration_date'],
    id: rawOption['id'],
    strikePrice: parseFloat(rawOption['strike_price']),
    type: rawOption['type'],
    url: rawOption['url'],
  };
}

async function getOptions(ids: string[]): Promise<Option[]> {
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

async function getMarketDataForStockPositions(stockPositions: StockPosition[]): Promise<InstrumentMarketData[]> {
  if (stockPositions.length === 0) {
    return [];
  }
  const instrumentUrls = stockPositions.map((stockPosition) => stockPosition.instrument);
  return await getMarketData(instrumentUrls, 'stocks');
}

async function getMarketDataForOptionPositions(optionPositions: OptionPosition[]): Promise<OptionMarketData[]> {
  if (optionPositions.length === 0) {
    return [];
  }
  const optionUrls = optionPositions.map((optionPosition) => optionPosition.option);
  return await getMarketData(optionUrls, 'options');
}

async function getOptionsForOptionPositions(optionPositions: OptionPosition[]): Promise<Option[]> {
  if (optionPositions.length === 0) {
    return [];
  }

  const ids = optionPositions.map(
    (optionPosition) => {
      const matchArray = optionPosition.option.match(/instruments\/(.*)\//);
      if (!matchArray || matchArray.length !== 2) {
        throw new Error(`Could not extract option id from option url: ${optionPosition.option}`);
      }
      return matchArray[1];
    }
  );
  return await getOptions(ids);
}

async function getAndUploadPositions() {
  console.log('Fetching positions');
  const stockPositions = await getStockPositions();
  const optionPositions = await getOptionPositions();
  console.log('Fetching market data');
  const stockMarketData = await getMarketDataForStockPositions(stockPositions);
  const optionMarketData = await getMarketDataForOptionPositions(optionPositions);
  console.log('Fetching metadata');
  const options = await getOptionsForOptionPositions(optionPositions);
  console.log('Uploading');
  await uploadPositions({
    positions: {
      stocks: stockPositions,
      options: optionPositions,
    },
    marketData: {
      stocks: stockMarketData,
      options: optionMarketData,
    },
    metadata: {
      options,
    },
  });
  console.log('Uploaded');
}

const interval = 1000 * 60 * 10;

async function wrappedGetAndUploadPositions() {
  try {
    await getAndUploadPositions();
  } catch (e) {
    console.log(e.response.config.url);
    if (e.response.data) {
      console.log(e.response.data);
    }
  }
}

setInterval(async () => {
  await wrappedGetAndUploadPositions();
}, interval);

wrappedGetAndUploadPositions();
