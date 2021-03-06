// @flow
const axios = require('axios');
const {jsonFileManager} = require('./JsonFileManager');

type Tokens = {
  bearer: string,
  refresh: string,
};
const tokenFileManager = new jsonFileManager('tokens', {
  bearer: null,
  refresh: null,
});

function checkEnvironmentVariables(environmentVariables) {
  for (let environmentVariable of environmentVariables) {
    if (!process.env[environmentVariable]) {
      throw new Error(`Must set ${environmentVariable} environment variable`)
    } else {
      console.log(environmentVariable, process.env[environmentVariable]);
    }
  }
}

checkEnvironmentVariables(['UPLOAD_ENDPOINT']);

const UPLOAD_ENDPOINT = process.env.UPLOAD_ENDPOINT || '';

const ROBINHOOD_CLIENT_ID = 'c82SH0WZOsabOXGP2sxqcj34FxkvfnWRZBKlBjFS';


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

type UploadPositionsRequestBody = {
  positions: {
    stocks: StockPosition[],
    options: OptionPosition[],
  },
  marketData: {
    stocks: InstrumentMarketData[],
    options: OptionMarketData[],
  },
  metadata: {
    options: Option[],
  },
};

async function uploadPositions(body: UploadPositionsRequestBody) {
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

async function refreshTokens() {
  let tokens: Tokens = await tokenFileManager.load();

  try {
    console.log('Refreshing tokens using stored tokens');
    tokens = await getNewTokens(tokens);
    console.log('Refreshed tokens');
  } catch (e) {
    console.log('Falling back to using env vars');
    if (process.env.ROBINHOOD_ACCESS_TOKEN) {
      console.log('Using access/bearer token from env var');
      tokens.bearer = process.env.ROBINHOOD_ACCESS_TOKEN || '';
    } else {
      throw new Error('ROBINHOOD_ACCESS_TOKEN env var is not set')
    }
    if (process.env.ROBINHOOD_REFRESH_TOKEN) {
      console.log('Using refresh token from env var');
      tokens.refresh = process.env.ROBINHOOD_REFRESH_TOKEN || '';
    } else {
      throw new Error('ROBINHOOD_REFRESH_TOKEN env var is not set')
    }

    console.log('Refreshing tokens');
    tokens = await getNewTokens(tokens);
    console.log('Refreshed tokens');
  }

  axios.defaults.headers.common['Authorization'] = `Bearer ${tokens.bearer}`;
  await tokenFileManager.save(tokens);
}

async function getNewTokens(tokens: Tokens): Promise<Tokens> {
  const response = await axios.post('https://api.robinhood.com/oauth2/token/', {
    client_id: 'c82SH0WZOsabOXGP2sxqcj34FxkvfnWRZBKlBjFS',
    device_token: '7bb909cd-0cce-44f4-a4ac-b6868013c756',
    grant_type: 'refresh_token',
    refresh_token: tokens.refresh,
    // scope: 'web_limited',
  });
  return {
    bearer: response.data['access_token'],
    refresh: response.data['refresh_token'],
  };
}

async function main() {
  try {
    await refreshTokens();
    await getAndUploadPositions();
  } catch (e) {
    console.log('Caught error:');
    if (e.response) {
      if (e.response.config && e.response.config.url) {
        console.log(e.response.config.url);
      }
      if (e.response.data) {
        console.log(e.response.data);
      }
    } else {
      console.log(e);
    }
  }
}

setInterval(async () => {
  await main();
}, interval);

(async function() {
  await main();
})();

