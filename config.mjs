export const config = {
  // Public storefront reopened at the owner's request. Set true to pause access.
  maintenance: false,
  brand: 'MOKWHEEL', store: 'MOKWHEEL',
  phone: '+7 917 460-07-07', phoneHref: '+79174600707',
  pickup: 'ТК «Южные ворота», выход 5, линия Ж8, павильоны 122–128',
  deadline: '2026-11-01T00:00:00+03:00', // «до 1 ноября»: по 31 октября включительно, Москва
  bulkFrom: 10, // Оптовая цена при покупке 10+ единиц одной модели.
  minOrder: 3, // Меньше 10 единиц — цена согласуется отдельно.
  origin: process.env.PUBLIC_ORIGIN || (process.env.NODE_ENV==='production' ? 'https://qronge-sale.ru' : 'http://localhost:3000'),
  metrikaId: '113405844',
  sellerName: process.env.SELLER_NAME || '', sellerInn: process.env.SELLER_INN || '',
  sellerAddress: process.env.SELLER_ADDRESS || '', privacyEmail: process.env.PRIVACY_EMAIL || '',
};
export const saleActive = (now = Date.now()) => now < Date.parse(config.deadline);
