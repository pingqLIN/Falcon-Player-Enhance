/* eslint-disable no-console */
const { DEFAULT_ENDPOINT, listModels, parseArgs } = require('./lib/lm-studio-client');

async function run() {
  const args = parseArgs(process.argv.slice(2));
  const endpoint = String(args.endpoint || DEFAULT_ENDPOINT);
  const apiKey = String(args.apiKey || 'lm-studio');

  try {
    const models = await listModels({ endpoint, apiKey });
    console.log(`LM Studio online: endpoint=${endpoint}`);
    console.log(`Models loaded: ${models.length}`);
    models.slice(0, 20).forEach((model, index) => {
      console.log(`${index + 1}. ${String(model.id || '')}`);
    });
  } catch (error) {
    console.error(`LM Studio offline: endpoint=${endpoint}`);
    console.error(String(error?.message || error));
    process.exit(1);
  }
}

run();
