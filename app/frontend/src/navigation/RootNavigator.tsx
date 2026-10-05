import React from 'react';
import { Platform, StyleSheet } from 'react-native';
import { DarkTheme, NavigationContainer, type Theme } from '@react-navigation/native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { colors, typography } from '../theme';
import ScanScreen from '../screens/ScanScreen';
import ProfileScreen from '../screens/ProfileScreen';
import HistoryScreen from '../screens/HistoryScreen';
import TabBarIcon from './TabBarIcon';
import type { RootTabParamList } from './types';

const Tab = createBottomTabNavigator<RootTabParamList>();

const navigationTheme: Theme = {
  ...DarkTheme,
  colors: {
    ...DarkTheme.colors,
    primary: colors.primary,
    background: colors.background,
    card: colors.surface,
    text: colors.text,
    border: colors.border,
    notification: colors.primary,
  },
};

export function RootNavigator() {
  return (
    <NavigationContainer theme={navigationTheme}>
      {/*
        Scan is declared first, which makes it the initial route — the spec's
        default tab. `initialRouteName` is set explicitly anyway so reordering
        the screens later cannot silently change the landing tab.
      */}
      <Tab.Navigator
        initialRouteName="Scan"
        screenOptions={({ route }) => ({
          headerShown: false,
          tabBarActiveTintColor: colors.primary,
          tabBarInactiveTintColor: colors.textFaint,
          tabBarStyle: styles.tabBar,
          tabBarLabelStyle: styles.tabLabel,
          tabBarIcon: ({ color, size }) => (
            <TabBarIcon route={route.name} color={color} size={size} />
          ),
          // Keeping screens mounted preserves scroll position and avoids
          // re-running the history fetch on every tab switch.
          lazy: true,
        })}
      >
        <Tab.Screen name="Scan" component={ScanScreen} options={{ title: 'Scan' }} />
        <Tab.Screen name="Profile" component={ProfileScreen} options={{ title: 'Profile' }} />
        <Tab.Screen name="History" component={HistoryScreen} options={{ title: 'History' }} />
      </Tab.Navigator>
    </NavigationContainer>
  );
}

const styles = StyleSheet.create({
  tabBar: {
    backgroundColor: colors.surface,
    borderTopColor: colors.border,
    borderTopWidth: 1,
    height: Platform.OS === 'ios' ? 86 : 64,
    paddingTop: 6,
    paddingBottom: Platform.OS === 'ios' ? 28 : 8,
  },
  tabLabel: { ...typography.caption, fontWeight: '600' },
});

export default RootNavigator;
