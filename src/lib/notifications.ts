export type NotificationPermissionState = 'granted' | 'denied' | 'default' | 'unsupported';

export function notificationsSupported(): boolean {
  return typeof window !== 'undefined' && 'Notification' in window;
}

export function getNotificationPermission(): NotificationPermissionState {
  if (!notificationsSupported()) return 'unsupported';
  return Notification.permission as NotificationPermissionState;
}

/** Request permission. Should only be called from a user gesture. */
export async function requestNotificationPermission(): Promise<NotificationPermissionState> {
  if (!notificationsSupported()) return 'unsupported';
  try {
    const result = await Notification.requestPermission();
    return result as NotificationPermissionState;
  } catch {
    return 'denied';
  }
}

export function showNotification(title: string, body: string): void {
  if (!notificationsSupported()) return;
  if (Notification.permission !== 'granted') return;
  try {
    new Notification(title, { body, tag: 'focustime' });
  } catch {
    /* Some browsers require a service worker; ignore failures. */
  }
}
