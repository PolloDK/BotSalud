import React, { useState, useEffect } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  SafeAreaView, ActivityIndicator, Alert, ScrollView,
} from 'react-native';
import { initialize, requestPermission } from 'react-native-health-connect';
import { getToken, saveToken } from '../storage';
import { configureBackgroundSync } from '../backgroundTask';
import { runSync } from '../services/sync';

type Status = 'loading' | 'unconfigured' | 'configured';

const PERMISSIONS = [
  { accessType: 'read', recordType: 'Weight' },
  { accessType: 'read', recordType: 'BodyFat' },
  { accessType: 'read', recordType: 'LeanBodyMass' },
  { accessType: 'read', recordType: 'Steps' },
  { accessType: 'read', recordType: 'ActiveCaloriesBurned' },
  { accessType: 'read', recordType: 'TotalCaloriesBurned' },
  { accessType: 'read', recordType: 'RestingHeartRate' },
  { accessType: 'read', recordType: 'SleepSession' },
  { accessType: 'read', recordType: 'ExerciseSession' },
  { accessType: 'read', recordType: 'Nutrition' },
];

export default function SetupScreen() {
  const [status, setStatus] = useState<Status>('loading');
  const [token, setToken] = useState('');
  const [savedToken, setSavedToken] = useState('');
  const [syncing, setSyncing] = useState(false);
  const [lastSyncResult, setLastSyncResult] = useState<string | null>(null);

  useEffect(() => {
    getToken().then((t) => {
      if (t) { setSavedToken(t); setStatus('configured'); }
      else setStatus('unconfigured');
    });
  }, []);

  const handleActivate = async () => {
    if (!token.trim()) {
      Alert.alert('Token requerido', 'Pega el token que te dio el bot en Telegram.');
      return;
    }
    try {
      // Save token first so app doesn't crash before persisting state
      await saveToken(token.trim());
      setSavedToken(token.trim());
      setStatus('configured');

      // Request Health Connect permissions (may open system dialog)
      try {
        const isAvailable = await initialize();
        if (isAvailable) {
          await requestPermission(PERMISSIONS);
        }
      } catch (permErr) {
        // Permissions failed but token is already saved — app still works
      }

      // Register background sync
      try {
        await configureBackgroundSync();
      } catch (bgErr) {
        // Background fetch registration failed — sync can be triggered manually
      }
    } catch (e) {
      Alert.alert('Error', 'No se pudo guardar la configuración. Intenta de nuevo.');
    }
  };

  const handleSync = async () => {
    setSyncing(true);
    const result = await runSync();
    setLastSyncResult(result === 'success' ? '✅ Sincronizado correctamente' : '❌ Error al sincronizar');
    setSyncing(false);
  };

  if (status === 'loading') {
    return (
      <View style={styles.centered}>
        <ActivityIndicator color="#00E5A0" size="large" />
      </View>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView contentContainerStyle={styles.scroll}>
        <View style={styles.header}>
          <Text style={styles.logo}>💪</Text>
          <Text style={styles.title}>BotSalud</Text>
          <Text style={styles.subtitle}>Tu asistente de salud inteligente</Text>
        </View>

        {status === 'unconfigured' ? (
          <View style={styles.card}>
            <Text style={styles.cardTitle}>Configura tu cuenta</Text>
            <Text style={styles.cardDesc}>
              Abre Telegram, busca tu bot y escribe{' '}
              <Text style={styles.code}>/start</Text>. Copia el token que te da y pégalo aquí.
            </Text>
            <TextInput
              style={styles.input}
              placeholder="Pega tu token de Telegram aquí"
              placeholderTextColor="#666"
              value={token}
              onChangeText={setToken}
              autoCapitalize="none"
              autoCorrect={false}
            />
            <TouchableOpacity style={styles.button} onPress={handleActivate}>
              <Text style={styles.buttonText}>Activar BotSalud</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <View>
            <View style={styles.statusCard}>
              <View style={styles.statusRow}>
                <View style={styles.dot} />
                <Text style={styles.statusText}>Sincronización activa</Text>
              </View>
              <Text style={styles.statusDesc}>
                Tus datos de Health Connect se sincronizan automáticamente cada noche.
              </Text>
            </View>

            <View style={styles.card}>
              <Text style={styles.cardTitle}>Token</Text>
              <Text style={styles.tokenText} numberOfLines={1}>{savedToken}</Text>
            </View>

            <TouchableOpacity
              style={[styles.button, syncing && styles.buttonDisabled]}
              onPress={handleSync}
              disabled={syncing}
            >
              {syncing
                ? <ActivityIndicator color="#000" />
                : <Text style={styles.buttonText}>Sincronizar ahora</Text>
              }
            </TouchableOpacity>

            {lastSyncResult && (
              <Text style={styles.syncResult}>{lastSyncResult}</Text>
            )}
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0A0A0F' },
  centered: { flex: 1, backgroundColor: '#0A0A0F', justifyContent: 'center', alignItems: 'center' },
  scroll: { flexGrow: 1, padding: 24 },
  header: { alignItems: 'center', paddingTop: 40, paddingBottom: 40 },
  logo: { fontSize: 64, marginBottom: 12 },
  title: { fontSize: 32, fontWeight: '800', color: '#FFFFFF', letterSpacing: -0.5 },
  subtitle: { fontSize: 14, color: '#666', marginTop: 6 },
  card: {
    backgroundColor: '#141418', borderRadius: 20, padding: 24,
    marginBottom: 16, borderWidth: 1, borderColor: '#1E1E28',
  },
  cardTitle: { fontSize: 16, fontWeight: '700', color: '#FFFFFF', marginBottom: 8 },
  cardDesc: { fontSize: 14, color: '#888', lineHeight: 22, marginBottom: 20 },
  code: { color: '#00E5A0', fontFamily: 'monospace' },
  input: {
    backgroundColor: '#1A1A22', borderRadius: 12, padding: 16,
    color: '#FFFFFF', fontSize: 14, borderWidth: 1, borderColor: '#2A2A38',
    marginBottom: 16, fontFamily: 'monospace',
  },
  button: {
    backgroundColor: '#00E5A0', borderRadius: 14, padding: 18,
    alignItems: 'center', marginBottom: 12,
  },
  buttonDisabled: { opacity: 0.6 },
  buttonText: { color: '#000000', fontWeight: '800', fontSize: 16 },
  statusCard: {
    backgroundColor: '#0D1F1A', borderRadius: 20, padding: 20,
    marginBottom: 16, borderWidth: 1, borderColor: '#00E5A020',
  },
  statusRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 8 },
  dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: '#00E5A0', marginRight: 8 },
  statusText: { color: '#00E5A0', fontWeight: '700', fontSize: 15 },
  statusDesc: { color: '#666', fontSize: 13, lineHeight: 20 },
  tokenText: { color: '#888', fontFamily: 'monospace', fontSize: 12 },
  syncResult: { color: '#888', textAlign: 'center', fontSize: 13, marginTop: 8 },
});
