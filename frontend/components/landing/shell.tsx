"use client";

import Image from "next/image";
import Link from "next/link";
import { useRef, useState, type ReactNode } from "react";
import { LangToggle } from "@/components/brand";
import { Icon } from "@/components/icons";
import { useI18n } from "@/lib/i18n";
import { landingCopy } from "./copy";
import { LandingMotion } from "./motion";
import s from "./landing.module.css";

// Visitors join by registering for an event; there is no separate membership sign-up.
const MEMBER_HREF = "/events";

export function Arrow({ diagonal = false }: { diagonal?: boolean }) {
  return (
    <svg
      className={s.arrow}
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d={diagonal ? "M6 18 18 6M6 6h12v12" : "M4 12h16m-6-6 6 6-6 6"} />
    </svg>
  );
}

export function SiteShell({
  children,
  listing = false,
  className = "",
  hideTopbar = false,
}: {
  children: ReactNode;
  listing?: boolean;
  className?: string;
  hideTopbar?: boolean;
}) {
  const { locale, t } = useI18n();
  const c = landingCopy[locale];
  const [menuOpen, setMenuOpen] = useState(false);
  const menuButton = useRef<HTMLButtonElement>(null);
  const links = [
    { href: "/", label: c.home },
    { href: "/events", label: c.events },
    { href: "/#about", label: c.about },
    { href: "/#journey", label: c.journey },
  ];
  return (
    <LandingMotion>
      <div className={`${s.page} ${className}`} id="top">
        <a href="#main" className={s.skip}>
          {c.skip}
        </a>
        {!hideTopbar && (
          <div className={s.topbar}>
            <div className={s.container}>
              <span>{c.platform}</span>
              <a
                href="https://myclinic.com.sa/"
                target="_blank"
                rel="noopener noreferrer"
              >
                {c.mainSite}
                <Icon name="external" size={12} />
              </a>
            </div>
          </div>
        )}
        <header className={s.header}>
          <div className={`${s.container} ${s.headerInner}`}>
            <Link href="/" className={s.brand} aria-label={c.brand}>
              <Image
                src="/images/myclinic/logo.webp"
                alt="My Clinic عيادتي"
                width={160}
                height={58}
                className={s.logo}
              />
              <span className={s.brandText}>
                {c.brand}
                <small>{c.brandEn}</small>
              </span>
            </Link>
            <nav className={s.desktopNav} aria-label={c.menu}>
              {links.map((link, index) => (
                <Link
                  key={link.href}
                  href={link.href}
                  aria-current={
                    (listing ? index === 1 : index === 0) ? "page" : undefined
                  }
                >
                  {link.label}
                </Link>
              ))}
            </nav>
            <div className={s.headerActions}>
              <LangToggle className={s.language} />
              <Link href={MEMBER_HREF} className={s.member} data-member="">
                <span>{c.member}</span>
                <small>{c.memberNote}</small>
              </Link>
              <Link href="/login" className={s.signIn}>
                <Icon name="user" size={16} />
                {t.public.login}
              </Link>
              <button
                ref={menuButton}
                className={s.menuButton}
                aria-label={c.menu}
                aria-controls="mobile-navigation"
                aria-expanded={menuOpen}
                onClick={() => setMenuOpen(!menuOpen)}
              >
                <Icon name={menuOpen ? "x" : "menu"} size={24} />
              </button>
            </div>
          </div>
          {menuOpen && (
            <nav
              id="mobile-navigation"
              className={s.mobileNav}
              aria-label={c.menu}
              onKeyDown={(event) => {
                if (event.key === "Escape") {
                  setMenuOpen(false);
                  menuButton.current?.focus();
                }
              }}
            >
              {links.map((link) => (
                <Link
                  key={link.href}
                  href={link.href}
                  onClick={() => setMenuOpen(false)}
                >
                  {link.label}
                  <Arrow />
                </Link>
              ))}
              <Link
                href={MEMBER_HREF}
                className={s.mobileMember}
                onClick={() => setMenuOpen(false)}
              >
                <span>
                  {c.member}
                  <small>{c.memberNote}</small>
                </span>
                <Arrow />
              </Link>
              <Link href="/login" onClick={() => setMenuOpen(false)}>
                {t.public.login}
                <Icon name="user" size={16} />
              </Link>
            </nav>
          )}
        </header>
        <main id="main">{children}</main>
        <footer className={s.footer}>
          <div className={s.container}>
            <div className={s.footerTop}>
              <div className={s.footerIdentity}>
                <Link href="/">
                  <Image
                    src="/images/myclinic/logo.webp"
                    alt="My Clinic عيادتي"
                    width={160}
                    height={58}
                  />
                </Link>
                <p>{c.footerText}</p>
                <span className={s.country}>
                  <Icon name="pin" size={16} />
                  {c.country}
                </span>
              </div>
              <div className={s.footerLinks}>
                <strong>{c.brand}</strong>
                {links.slice(1).map((link) => (
                  <Link key={link.href} href={link.href}>
                    {link.label}
                  </Link>
                ))}
                <Link href="/#faq">{c.faq}</Link>
              </div>
              <div className={s.footerLinks}>
                <strong>{c.mainSite}</strong>
                <a
                  href="https://myclinic.com.sa/"
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  myclinic.com.sa <Icon name="external" size={13} />
                </a>
                <a
                  href="https://myclinic.com.sa/privacy-policy"
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  {c.privacy}
                </a>
                <Link href="/login">{t.public.login}</Link>
              </div>
            </div>
            <div className={s.footerBottom}>
              <span>
                © {new Date().getFullYear()} {c.footerRights}
              </span>
              <span>{c.footerTag}</span>
              <a href="#top">
                {c.backTop}
                <Icon name="chevronRight" className={s.upArrow} size={16} />
              </a>
            </div>
          </div>
        </footer>
      </div>
    </LandingMotion>
  );
}
