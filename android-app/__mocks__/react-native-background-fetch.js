module.exports = {
  configure: jest.fn(() => Promise.resolve(0)),
  scheduleTask: jest.fn(() => Promise.resolve(true)),
  finish: jest.fn(),
  registerHeadlessTask: jest.fn(),
  NETWORK_TYPE_ANY: 0,
  STATUS_AVAILABLE: 2,
};
