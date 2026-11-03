export function getAccessToken(): string | null {
  if (typeof window === "undefined") return null;
  return sessionStorage.getItem("previewToken") ?? localStorage.getItem("token");
}
