async function initApp() {
  bind();
  await loadMarketNews();
  render();
  syncMarket(false);
}

initApp();
