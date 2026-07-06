async function initApp() {
  loadCoinState(state.coin);
  bind();
  render();
  await syncMarket(false);
  await refreshMarketData();
}

initApp();
