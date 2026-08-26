import React, { useState, useEffect, useRef } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  SafeAreaView, ActivityIndicator, Alert, ScrollView, AppState, Linking,
} from 'react-native';

import { initialize, requestPermission, openHealthConnectSettings } from 'react-native-health-connect';
import { getToken, saveToken } from '../storage';
import { configureBackgroundSync } from '../backgroundTask';
import { runSync } from '../services/sync';
import { checkGrantedPermissions } from '../services/healthConnect';
import { checkSyncPending } from '../services/api';
import { checkForUpdate, UpdateInfo } from '../services/updater';

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

const REQUIRED_TYPES = PERMISSIONS.map(p => p.recordType);

export default function SetupScreen() {
  const [status, setStatus] = useState<Status>('loading');
  const [token, setToken] = useState('');
  const [savedToken, setSavedToken] = useState('');
  const [syncing, setSyncing] = useState(false);
  const [syncMsg, setSyncMsg] = useState<string | null>(null);
  const [requestingPerms, setRequestingPerms] = useState(false);
  const [grantedPerms, setGrantedPerms] = useState<string[] | null>(null);
  const [update, setUpdate] = useState<UpdateInfo | null>(null);
  const appState = useRef(AppState.currentState);

  useEffect(() => {
    getToken().then((t) => {
      if (t) { setSavedToken(t); setStatus('configured'); refreshPerms(); }
      else setStatus('unconfigured');
    });
    checkForUpdate().then(setUpdate);
  }, []);

  const refreshPerms = async () => {
    try {
      const granted = await checkGrantedPermissions();
      setGrantedPerms(granted);
    } catch {
      setGrantedPerms([]);
    }
  };

  // Auto-sync when app comes to foreground if /sincronizar was requested from Telegram
  useEffect(() => {
    const sub = AppState.addEventListener('change', async (nextState) => {
      if (appState.current.match(/inactive|background/) && nextState === 'active') {
        refreshPerms();
        const tok = await getToken();
        if (!tok) return;
        try {
          const pending = await checkSyncPending(tok);
          if (pending) {
            setSyncing(true);
            const result = await runSync();
            setSyncMsg(formatSyncMsg(result));
            setSyncing(false);
          }
        } catch { /* network error, ignore */ }
      }
      appState.current = nextState;
    });
    return () => sub.remove();
  }, []);

  const formatSyncMsg = (result: any): string => {
    if (result.status === 'success') {
      const days = result.daysPosted ?? 0;
      const failed = result.daysFailed ?? 0;
      const base = days > 0
        ? `✅ Sincronizado — ${days} día${days === 1 ? '' : 's'} (${result.hcFields ?? 0} métricas)`
        : '⚠️ Sincronizado sin datos de Health Connect';
      return failed > 0 ? `${base} · ${failed} con error, se reintentarán` : base;
    }
    if (result.status === 'no-token') return '❌ Token no configurado';
    return `❌ Error: ${result.message ?? 'desconocido'}`;
  };

  const handleActivate = async () => {
    if (!token.trim()) {
      Alert.alert('Token requerido', 'Pega el token que te dio el bot en Telegram.');
      return;
    }
    try {
      await saveToken(token.trim());
      setSavedToken(token.trim());
      setStatus('configured');

      try {
        const isAvailable = await initialize();
        if (isAvailable) {
          await requestPermission(PERMISSIONS as any);
          await refreshPerms();
        }
      } catch {}

      try { await configureBackgroundSync(); } catch {}
    } catch {
      Alert.alert('Error', 'No se pudo guardar la configuración. Intenta de nuevo.');
    }
  };

  const handleRequestPermissions = async () => {
    setRequestingPerms(true);
    try {
      const isAvailable = await initialize();
      if (!isAvailable) {
        Alert.alert('Health Connect no disponible', 'Instala Health Connect desde Play Store.');
        return;
      }
      await requestPermission(PERMISSIONS as any);
      await refreshPerms();
    } catch (e: any) {
      Alert.alert('Error', `No se pudieron conceder los permisos: ${e?.message ?? String(e)}`);
    } finally {
      setRequestingPerms(false);
    }
  };

  const handleSync = async () => {
    setSyncing(true);
    setSyncMsg(null);
    const result = await runSync();
    setSyncMsg(formatSyncMsg(result));
    setSyncing(false);
  };

  const grantedCount = grantedPerms?.filter(t => REQUIRED_TYPES.includes(t)).length ?? 0;
  const allGranted = grantedCount >= REQUIRED_TYPES.length;

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

        {update?.available && (
          <TouchableOpacity
            style={styles.updateBanner}
            onPress={() => { if (update.apkUrl) Linking.openURL(update.apkUrl); }}
          >
            <Text style={styles.updateTitle}>⬆️ Nueva versión disponible ({update.latestTag})</Text>
            <Text style={styles.updateDesc}>Toca para descargar e instalar la actualización.</Text>
          </TouchableOpacity>
        )}

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

            {/* Permissions status */}
            {grantedPerms !== null && (
              <View style={[styles.permCard, allGranted ? styles.permCardOk : styles.permCardWarn]}>
                <Text style={[styles.permTitle, allGranted ? styles.permTitleOk : styles.permTitleWarn]}>
                  {allGranted
                    ? `✅ Permisos OK (${grantedCount}/${REQUIRED_TYPES.length})`
                    : `⚠️ Permisos incompletos (${grantedCount}/${REQUIRED_TYPES.length})`}
                </Text>
                {!allGranted && (
                  <Text style={styles.permDesc}>
                    Faltan permisos de Health Connect. Presiona "Conceder permisos" para activarlos.
                  </Text>
                )}
              </View>
            )}

            <View style={styles.card}>
              <Text style={styles.cardTitle}>Token</Text>
              <Text style={styles.tokenText} numberOfLines={1}>{savedToken}</Text>
            </View>

            <TouchableOpacity
              style={[styles.buttonSecondary, requestingPerms && styles.buttonDisabled]}
              onPress={handleRequestPermissions}
              disabled={requestingPerms}
            >
              {requestingPerms
                ? <ActivityIndicator color="#00E5A0" />
                : <Text style={styles.buttonSecondaryText}>Conceder permisos Health Connect</Text>
              }
            </TouchableOpacity>

            {!allGranted && (
              <TouchableOpacity
                style={styles.buttonOutline}
                onPress={() => {
                  try { openHealthConnectSettings(); } catch {}
                  setTimeout(refreshPerms, 3000);
                }}
              >
                <Text style={styles.buttonOutlineText}>Abrir configuración de permisos</Text>
              </TouchableOpacity>
            )}

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

            {syncMsg && (
              <Text style={[styles.syncResult, syncMsg.startsWith('✅') ? styles.syncOk : syncMsg.startsWith('⚠️') ? styles.syncWarn : styles.syncErr]}>
                {syncMsg}
              </Text>
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
  permCard: {
    borderRadius: 16, padding: 16, marginBottom: 16, borderWidth: 1,
  },
  permCardOk: { backgroundColor: '#0D1F1A', borderColor: '#00E5A030' },
  permCardWarn: { backgroundColor: '#1F1500', borderColor: '#FF990030' },
  permTitle: { fontWeight: '700', fontSize: 14, marginBottom: 4 },
  permTitleOk: { color: '#00E5A0' },
  permTitleWarn: { color: '#FF9900' },
  permDesc: { color: '#999', fontSize: 13, lineHeight: 18 },
  syncResult: { textAlign: 'center', fontSize: 13, marginTop: 8, lineHeight: 20 },
  syncOk: { color: '#00E5A0' },
  syncWarn: { color: '#FF9900' },
  syncErr: { color: '#FF4444' },
  buttonSecondary: {
    backgroundColor: 'transparent', borderRadius: 14, padding: 16,
    alignItems: 'center', marginBottom: 12, borderWidth: 1, borderColor: '#00E5A0',
  },
  buttonSecondaryText: { color: '#00E5A0', fontWeight: '700', fontSize: 15 },
  buttonOutline: {
    backgroundColor: 'transparent', borderRadius: 14, padding: 14,
    alignItems: 'center', marginBottom: 12, borderWidth: 1, borderColor: '#444',
  },
  buttonOutlineText: { color: '#888', fontWeight: '600', fontSize: 14 },
  updateBanner: {
    backgroundColor: '#0D1F1A', borderRadius: 16, padding: 16, marginBottom: 16,
    borderWidth: 1, borderColor: '#00E5A0',
  },
  updateTitle: { color: '#00E5A0', fontWeight: '700', fontSize: 14, marginBottom: 4 },
  updateDesc: { color: '#999', fontSize: 13, lineHeight: 18 },
});
