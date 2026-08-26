module.exports = {
  initialize: jest.fn(() => Promise.resolve(true)),
  requestPermission: jest.fn(() => Promise.resolve([])),
  getGrantedPermissions: jest.fn(() => Promise.resolve([])),
  readRecords: jest.fn(() => Promise.resolve({ records: [] })),
  aggregateRecord: jest.fn(() => Promise.resolve({})),
  openHealthConnectSettings: jest.fn(),
};
