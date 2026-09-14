/** A wa.me link that opens WhatsApp with a prefilled message, optionally to a specific number. */
export function whatsappUrl(text: string, phone?: string | null): string {
  const digits = (phone ?? "").replace(/\D/g, "");
  return `https://wa.me/${digits}?text=${encodeURIComponent(text)}`;
}
