async function initApp() {
  loadRiskFreeRateState();
  loadCoinState(state.coin);
  bind();
  render();
  await syncMarket(false);
  await refreshMarketData();
}

initApp();
