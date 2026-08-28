// Format date and time to Brasilia Timezone (America/Sao_Paulo / UTC-3)
export function formatBrasiliaDateTime(isoOrDateString?: string | null): string {
  if (!isoOrDateString) return 'Aguardando GPS...';
  try {
    const date = new Date(isoOrDateString);
    if (isNaN(date.getTime())) return isoOrDateString;

    return new Intl.DateTimeFormat('pt-BR', {
      timeZone: 'America/Sao_Paulo',
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false,
    }).format(date);
  } catch {
    return isoOrDateString;
  }
}

export function formatBrasiliaTimeOnly(isoOrDateString?: string | null): string {
  if (!isoOrDateString) return '--:--:--';
  try {
    const date = new Date(isoOrDateString);
    if (isNaN(date.getTime())) return '--:--:--';

    return new Intl.DateTimeFormat('pt-BR', {
      timeZone: 'America/Sao_Paulo',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false,
    }).format(date);
  } catch {
    return '--:--:--';
  }
}

export function getCompassDirection(degrees: number): string {
  const directions = ['N', 'NE', 'E', 'SE', 'S', 'SO', 'O', 'NO'];
  const index = Math.round(((degrees % 360) / 45)) % 8;
  return `${directions[index]} (${Math.round(degrees)}°)`;
}

export function formatDistance(meters: number): string {
  if (meters >= 1000) {
    return `${(meters / 1000).toFixed(2)} km`;
  }
  return `${Math.round(meters)} m`;
}

// Check if user is on mobile browser
export function isMobileDevice(): boolean {
  if (typeof window === 'undefined') return false;
  const userAgent = navigator.userAgent || navigator.vendor || (window as any).opera;
  return /android|iphone|ipad|ipod|blackberry|iemobile|opera mini/i.test(userAgent.toLowerCase()) || window.innerWidth < 768;
}
