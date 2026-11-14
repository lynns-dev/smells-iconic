import React from "react";
import Head from "next/head";
import Link from "next/link";
import Header from "../components/Header";
import Footer from "../components/Footer";
import CartDrawer from "../components/CartDrawer";
import { useCart } from "../lib/useCart";
import { T, S } from "../lib/theme";
import { BRAND } from "../lib/email/brand";
import {
  BIRTHDAY_CONSENT_TEXT,
  BIRTHDAY_CONSENT_VERSION,
  BIRTHDAY_MONTHS,
} from "../lib/birthdayConsent";

export default function BirthdayPage() {
  const cart = useCart();
  const [form, setForm] = React.useState({
    email: "",
    month: "",
    day: "",
    consent: false,
    website: "",
  });
  const [status, setStatus] = React.useState("idle");
  const [error, setError] = React.useState("");
  const monthDays =
    [31, 29, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][Number(form.month) - 1] ||
    31;
  const change = (key) => (event) => {
    const value = key === "consent" ? event.target.checked : event.target.value;
    setForm((previous) => ({
      ...previous,
      [key]: value,
      ...(key === "month" &&
      Number(previous.day) >
        ([31, 29, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][Number(value) - 1] ||
          31)
        ? { day: "" }
        : {}),
    }));
    setError("");
  };
  async function submit(event) {
    event.preventDefault();
    setStatus("saving");
    setError("");
    try {
      const response = await fetch("/api/birthday", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...form,
          consentVersion: BIRTHDAY_CONSENT_VERSION,
        }),
      });
      const result = await response.json();
      if (!response.ok)
        throw new Error(
          result.error || "We couldn’t save that. Please try again.",
        );
      setStatus("saved");
    } catch (failure) {
      setError(failure.message || "We couldn’t save that. Please try again.");
      setStatus("idle");
    }
  }
  return (
    <div>
      <Head>
        <title>Birthday program — {BRAND.name}</title>
        <meta
          name="description"
          content={`Optionally share your birthday month and day with ${BRAND.name}. No birth year or purchase required.`}
        />
      </Head>
      <Header cartCount={cart.count} onCartClick={() => cart.setOpen(true)} />
      <main
        className="birthday-page"
        style={{ ...S.wrap, maxWidth: 660, padding: "64px 24px 80px" }}
      >
        <p style={S.label}>{BRAND.name} · Birthday program</p>
        <h1
          style={{
            ...S.h2,
            fontSize: "clamp(34px,6vw,52px)",
            margin: "14px 0 18px",
          }}
        >
          Your day, on the calendar.
        </h1>
        <p style={{ lineHeight: 1.75, color: T.soft }}>
          We’re planning a birthday program. If you’d like to take part as it
          develops, share your month and day. No birth year. No purchase
          required.
        </p>
        <div
          style={{
            marginTop: 28,
            padding: 24,
            border: `1px solid ${T.line}`,
            borderRadius: 12,
            background: "#fff",
          }}
        >
          {status === "saved" ? (
            <div role="status">
              <h2 style={{ fontSize: 23, marginBottom: 12 }}>
                Your birthday details are saved.
              </h2>
              <p style={{ lineHeight: 1.7 }}>
                Thanks for joining {BRAND.name}’s birthday list. We’re only
                collecting preferences right now; gifts and program details
                haven’t been finalized.
              </p>
              <Link
                href="/shop"
                style={{ ...S.btnFill, marginTop: 24, borderRadius: 8 }}
              >
                Back to the shop
              </Link>
            </div>
          ) : (
            <form
              onSubmit={submit}
              data-clarity-mask="true"
              className="clarity-mask"
              style={{ display: "grid", gap: 20 }}
            >
              <div>
                <label htmlFor="birthday-email" style={label}>
                  Email address
                </label>
                <input
                  id="birthday-email"
                  name="email"
                  type="email"
                  autoComplete="email"
                  maxLength={254}
                  required
                  value={form.email}
                  onChange={change("email")}
                  style={field}
                  disabled={status === "saving"}
                  aria-describedby="birthday-email-note"
                />
                <p id="birthday-email-note" style={hint}>
                  Use the email you use with {BRAND.name}, if you already shop
                  with us.
                </p>
              </div>
              <fieldset
                style={{ border: 0, padding: 0, margin: 0, minWidth: 0 }}
              >
                <legend style={label}>Birthday — month and day only</legend>
                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "1.4fr 1fr",
                    gap: 12,
                  }}
                >
                  <div>
                    <label htmlFor="birthday-month" style={label}>
                      Month
                    </label>
                    <select
                      id="birthday-month"
                      name="month"
                      autoComplete="bday-month"
                      required
                      value={form.month}
                      onChange={change("month")}
                      style={field}
                      disabled={status === "saving"}
                    >
                      <option value="">Month</option>
                      {BIRTHDAY_MONTHS.map((name, index) => (
                        <option key={name} value={index + 1}>
                          {name}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label htmlFor="birthday-day" style={label}>
                      Day
                    </label>
                    <select
                      id="birthday-day"
                      name="day"
                      autoComplete="bday-day"
                      required
                      value={form.day}
                      onChange={change("day")}
                      style={field}
                      disabled={status === "saving"}
                    >
                      <option value="">Day</option>
                      {Array.from({ length: monthDays }, (_, i) => (
                        <option key={i + 1} value={i + 1}>
                          {i + 1}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
              </fieldset>
              <label
                style={{
                  display: "flex",
                  alignItems: "flex-start",
                  gap: 12,
                  fontSize: 13,
                  lineHeight: 1.65,
                  cursor: "pointer",
                }}
              >
                <input
                  type="checkbox"
                  name="consent"
                  checked={form.consent}
                  onChange={change("consent")}
                  required
                  disabled={status === "saving"}
                  style={{ flexShrink: 0, width: 20, height: 20, marginTop: 2 }}
                />
                <span>{BIRTHDAY_CONSENT_TEXT}</span>
              </label>
              <input
                name="website"
                aria-hidden="true"
                tabIndex={-1}
                autoComplete="off"
                value={form.website}
                onChange={change("website")}
                style={{
                  position: "absolute",
                  left: -9999,
                  width: 1,
                  height: 1,
                }}
              />
              {error && (
                <p role="alert" style={{ color: "#a13d2b", fontSize: 13 }}>
                  {error}
                </p>
              )}
              <button
                type="submit"
                disabled={status === "saving"}
                style={{
                  ...S.btnFill,
                  minHeight: 48,
                  justifyContent: "center",
                  borderRadius: 8,
                  opacity: status === "saving" ? 0.65 : 1,
                }}
              >
                {status === "saving" ? "Saving…" : "Save my birthday"}
              </button>
              <p style={hint}>
                This signup is optional. Birthday benefits, eligibility and
                availability are still being planned; no gift or reward is
                guaranteed. Nothing will be sent as part of this signup.
              </p>
            </form>
          )}
        </div>
        <p style={{ ...hint, marginTop: 20 }}>
          Your birthday details are saved for {BRAND.name} only. To update or
          remove them,{" "}
          <Link href="/privacy" style={{ textDecoration: "underline" }}>
            contact us using the details in our Privacy Policy
          </Link>
          .
        </p>
      </main>
      <Footer />
      <CartDrawer {...cart} onClose={() => cart.setOpen(false)} />
      <style jsx>{`
        .birthday-page input:focus-visible,
        .birthday-page select:focus-visible,
        .birthday-page button:focus-visible {
          outline: 2px solid ${T.ink};
          outline-offset: 3px;
        }
      `}</style>
    </div>
  );
}
const label = {
  display: "block",
  fontSize: 13,
  fontWeight: 600,
  marginBottom: 8,
};
const field = {
  width: "100%",
  minWidth: 0,
  height: 48,
  border: "1px solid #8c8179",
  borderRadius: 8,
  background: "#fff",
  color: T.ink,
  padding: "0 12px",
  font: "inherit",
  fontSize: 16,
};
const hint = { color: T.soft, fontSize: 12, lineHeight: 1.7, marginTop: 8 };
