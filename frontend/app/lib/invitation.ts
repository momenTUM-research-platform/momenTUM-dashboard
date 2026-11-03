export interface InvitationDraft {
  user: { name: string; username: string; email: string };
  url: string;
  expiresAt: string;
  purpose: "invite" | "reset";
}

export function formatInvitationExpiry(value: string): string {
  const formatter = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/Berlin",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
    timeZoneName: "short",
  });
  const parts = Object.fromEntries(
    formatter.formatToParts(new Date(value)).map(part => [part.type, part.value]),
  );
  return `${parts.day}.${parts.month}.${parts.year} at ${parts.hour}:${parts.minute} ${parts.timeZoneName}`;
}

export function invitationEmail(link: InvitationDraft): string {
  const subject = link.purpose === "invite"
    ? "Your momenTUM dashboard account"
    : "Reset your momenTUM dashboard password";
  const introduction = link.purpose === "invite"
    ? "Your momenTUM dashboard account is ready."
    : "Your administrator has provided a link to reset your dashboard password.";
  const body = `Hello ${link.user.name},\n\n${introduction}\n\nUsername: ${link.user.username}\n\nChoose your password using this link:\n${link.url}\n\nThis link can be used once and expires on ${formatInvitationExpiry(link.expiresAt)}.\n\nAfter saving your password, sign in at ${new URL("/login", link.url).href}.\n\nIf the link has expired or you need help, reply to this email.\n\nBest regards,\nThe momenTUM team\n`;
  return `mailto:${encodeURIComponent(link.user.email)}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
}
