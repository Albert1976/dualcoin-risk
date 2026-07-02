function initApp() {
  loadCoinState(state.coin);
  bind();
  render();
  syncMarket(false);
}

initApp();
