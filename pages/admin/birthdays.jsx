import React from "react";
import Head from "next/head";
import Link from "next/link";
import { BRAND } from "../../lib/email/brand";
import { BIRTHDAY_MONTHS } from "../../lib/birthdayConsent";
export default function BirthdayAdmin() {
  const [profiles, setProfiles] = React.useState([]),
    [cursor, setCursor] = React.useState("0");
  const [busy, setBusy] = React.useState(false),
    [error, setError] = React.useState("");
  const load = React.useCallback(async (after = "0") => {
    setBusy(true);
    setError("");
    try {
      const response = await fetch(
        `/api/admin/birthdays?cursor=${encodeURIComponent(after)}`,
        { cache: "no-store" },
      );
      const data = await response.json();
      if (!response.ok)
        throw new Error(data.error || "Could not load birthdays.");
      setProfiles((previous) =>
        after === "0"
          ? data.profiles
          : [
              ...previous.filter(
                (p) => !data.profiles.some((n) => n.id === p.id),
              ),
              ...data.profiles,
            ],
      );
      setCursor(data.cursor);
    } catch (failure) {
      setError(failure.message);
    } finally {
      setBusy(false);
    }
  }, []);
  React.useEffect(() => {
    load();
  }, [load]);
  async function withdraw(id) {
    setBusy(true);
    setError("");
    try {
      const response = await fetch("/api/admin/birthdays", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "withdraw", id }),
      });
      if (!response.ok) throw new Error("Could not withdraw this signup.");
      setProfiles((previous) => previous.filter((p) => p.id !== id));
    } catch (failure) {
      setError(failure.message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <main
      data-clarity-mask="true"
      className="clarity-mask"
      style={{
        maxWidth: 1000,
        margin: "0 auto",
        padding: "32px 20px",
        fontFamily: "system-ui, sans-serif",
        color: "#211a16",
      }}
    >
      <Head>
        <title>Birthday program — {BRAND.name} admin</title>
        <meta name="robots" content="noindex,nofollow" />
      </Head>
      <Link
        href="/admin/email?tab=subscribers"
        style={{ textDecoration: "underline" }}
      >
        ← Email &amp; SMS audience
      </Link>
      <h1 style={{ margin: "22px 0 12px", fontSize: 28 }}>Birthday program</h1>
      <p style={{ background: "#f6f1e8", padding: 18, lineHeight: 1.6 }}>
        Collection only for {BRAND.name}. No gifts, payments, emails or texts
        are activated. Birthdays and email ownership are self-reported and
        unverified; this list is not ready for automated rewards.
      </p>
      <p style={{ margin: "20px 0", lineHeight: 1.6 }}>
        Each signup is associated with this brand’s customer email and includes
        its own consent record. Withdrawing a signup removes the email and
        birthday details from this program and retains a withdrawal marker.
      </p>
      <Link href="/birthday" style={{ textDecoration: "underline" }}>
        View the public signup form
      </Link>
      {error && (
        <p role="alert" style={{ color: "#a13d2b", marginTop: 16 }}>
          {error}
        </p>
      )}
      <div style={{ overflowX: "auto", marginTop: 24 }}>
        <table
          style={{ borderCollapse: "collapse", width: "100%", fontSize: 14 }}
        >
          <thead>
            <tr>
              {["Customer email", "Birthday", "Consent recorded", "Manage"].map(
                (title) => (
                  <th key={title} style={cell}>
                    {title}
                  </th>
                ),
              )}
            </tr>
          </thead>
          <tbody>
            {profiles.map((profile) => (
              <tr key={profile.id}>
                <td style={cell}>{profile.customerEmail}</td>
                <td style={cell}>
                  {BIRTHDAY_MONTHS[profile.month - 1]} {profile.day}
                </td>
                <td style={cell}>
                  <details>
                    <summary>
                      {new Date(profile.consentAt).toLocaleDateString("en-US", {
                        timeZone: "America/Los_Angeles",
                      })}
                    </summary>
                    <p style={{ maxWidth: 340, marginTop: 8, lineHeight: 1.5 }}>
                      {profile.consentText}
                    </p>
                    <small>
                      {profile.consentVersion} · {profile.source}
                    </small>
                  </details>
                </td>
                <td style={cell}>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => withdraw(profile.id)}
                    aria-label={`Withdraw birthday consent for ${profile.customerEmail}`}
                    style={{
                      minHeight: 44,
                      padding: "8px 12px",
                      cursor: "pointer",
                    }}
                  >
                    Withdraw
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {!profiles.length && !busy && !error && (
        <p style={{ marginTop: 24 }}>No birthday signups on this page yet.</p>
      )}
      <div style={{ display: "flex", gap: 12, marginTop: 24 }}>
        <button
          type="button"
          disabled={busy}
          onClick={() => load()}
          style={{ minHeight: 44, padding: "8px 16px" }}
        >
          {busy ? "Loading…" : "Refresh"}
        </button>
        {cursor !== "0" && (
          <button
            type="button"
            disabled={busy}
            onClick={() => load(cursor)}
            style={{ minHeight: 44, padding: "8px 16px" }}
          >
            Load more
          </button>
        )}
      </div>
    </main>
  );
}
const cell = {
  textAlign: "left",
  padding: "14px 12px",
  borderBottom: "1px solid #ddd",
  verticalAlign: "top",
};
