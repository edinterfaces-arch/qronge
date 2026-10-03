export const config = {
  brand: 'QRONGE', store: 'Mokwheel',
  phone: '+7 925 708-79-99', phoneHref: '+79257087999', secondPhone: '+7 925 831-87-77',
  pickup: 'ТК «Южные ворота», выход 5, линия Ж8, павильоны 122–128',
  deadline: '2026-11-01T00:00:00+03:00', // «до 1 ноября»: по 31 октября включительно, Москва
  bulkFrom: 10, // Оптовая цена при покупке 10+ единиц одной модели.
  origin: process.env.PUBLIC_ORIGIN || 'http://localhost:3000',
  metrikaId: /^\d+$/.test(process.env.METRIKA_ID || '') ? process.env.METRIKA_ID : '',
  sellerName: process.env.SELLER_NAME || '', sellerInn: process.env.SELLER_INN || '',
  sellerAddress: process.env.SELLER_ADDRESS || '', privacyEmail: process.env.PRIVACY_EMAIL || '',
};
export const saleActive = (now = Date.now()) => now < Date.parse(config.deadline);
