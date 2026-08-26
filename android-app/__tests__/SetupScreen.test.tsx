import React from 'react';
import { render, fireEvent, screen, userEvent } from '@testing-library/react-native';
import SetupScreen from '../src/screens/SetupScreen';

jest.mock('../src/storage', () => ({
  getToken: jest.fn(() => Promise.resolve(null)),
  saveToken: jest.fn(() => Promise.resolve()),
}));
jest.mock('../src/services/sync', () => ({
  runSync: jest.fn(() => Promise.resolve('success')),
}));
jest.mock('react-native-health-connect', () => ({
  initialize: jest.fn(() => Promise.resolve(true)),
  requestPermission: jest.fn(() => Promise.resolve([])),
  getGrantedPermissions: jest.fn(() => Promise.resolve([])),
  openHealthConnectSettings: jest.fn(),
}));
jest.mock('../src/backgroundTask', () => ({
  configureBackgroundSync: jest.fn(() => Promise.resolve()),
}));

it('shows token input when not configured', async () => {
  await render(<SetupScreen />);
  const input = await screen.findByPlaceholderText('Pega tu token de Telegram aquí');
  expect(input).toBeTruthy();
});

it('saves token and shows configured state on activation', async () => {
  const user = userEvent.setup();
  await render(<SetupScreen />);
  const input = await screen.findByPlaceholderText('Pega tu token de Telegram aquí');
  await user.type(input, 'abc-token-123');
  await user.press(screen.getByText('Activar BotSalud'));
  const status = await screen.findByText('Sincronización activa');
  expect(status).toBeTruthy();
});
