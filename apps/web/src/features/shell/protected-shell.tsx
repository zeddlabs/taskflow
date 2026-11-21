"use client";

import {
  QueryClient,
  QueryClientProvider,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import * as Dialog from "@radix-ui/react-dialog";
import {
  ArrowRight,
  PanelLeft,
  LayoutDashboard,
  UserRound,
  LogOut,
  X,
  ChevronRight,
  Mail,
  Globe2,
  ShieldCheck,
} from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";
import { Brand } from "../../components/brand";
import { Button } from "../../components/ui/button";
import {
  ApiError,
  errorMessage,
  listenForSessionChange,
  loadProfile,
  logout,
  type Profile,
} from "../auth/session";
type View = "overview" | "account";
type ShellProps = { view: View; initialProfile?: Profile };

export function ProtectedShell(props: ShellProps) {
  const [client] = useState(() => new QueryClient());
  return (
    <QueryClientProvider client={client}>
      <Shell {...props} />
    </QueryClientProvider>
  );
}
function Sidebar({
  view,
  profile,
  onNavigate,
}: {
  view: View;
  profile: Profile;
  onNavigate?: () => void;
}) {
  return (
    <>
      <Brand />
      <nav aria-label="Main navigation">
        <span className="nav-label">Personal</span>
        {(
          [
            {
              href: "/app",
              label: "Overview",
              key: "overview",
              icon: LayoutDashboard,
            },
            {
              href: "/app/account",
              label: "Account",
              key: "account",
              icon: UserRound,
            },
          ] as const
        ).map(({ href, label, key, icon: Icon }) => (
          <Link
            prefetch={false}
            key={key}
            href={href}
            onClick={onNavigate}
            aria-current={view === key ? "page" : undefined}
          >
            <Icon size={18} />
            {label}
          </Link>
        ))}
      </nav>
      <div className="sidebar-person">
        <span className="avatar">{profile.name.charAt(0).toUpperCase()}</span>
        <div>
          <strong>{profile.name}</strong>
          <small>Personal account</small>
        </div>
      </div>
    </>
  );
}
function Shell({ view, initialProfile }: ShellProps) {
  const client = useQueryClient();
  const query = useQuery({
    queryKey: ["session", "me"],
    queryFn: loadProfile,
    initialData: initialProfile,
    retry: false,
    refetchOnMount: "always",
  });
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState("");
  const [drawer, setDrawer] = useState(false);
  const expired = query.error instanceof ApiError && query.error.status === 401;
  useEffect(() => {
    function change(signedIn: boolean) {
      client.clear();
      window.location.replace(signedIn ? "/app" : "/login");
    }
    const stop = listenForSessionChange(change);
    function restored(event: PageTransitionEvent) {
      if (event.persisted) window.location.reload();
    }
    window.addEventListener("pageshow", restored);
    return () => {
      stop();
      window.removeEventListener("pageshow", restored);
    };
  }, [client]);
  useEffect(() => {
    if (expired) {
      client.clear();
      window.location.replace("/login");
    }
  }, [expired, client]);
  async function signOut() {
    setBusy(true);
    setFailure("");
    try {
      await logout();
      client.clear();
      window.location.replace("/login");
    } catch (error) {
      setFailure(errorMessage(error));
      setBusy(false);
    }
  }
  if (expired || (!query.data && !query.error))
    return (
      <main className="gate">
        <Brand />
        <p role="status">Opening your dashboard…</p>
      </main>
    );
  if (query.error || !query.data)
    return (
      <main className="gate">
        <Brand />
        <h1>Account unavailable</h1>
        <p role="alert">{errorMessage(query.error)}</p>
        <Button onClick={() => void query.refetch()}>Try again</Button>
        <Link href="/login">Return to sign in</Link>
      </main>
    );
  const profile = query.data;
  const title = view === "overview" ? "Overview" : "Account";
  const info = (
    <dl className="details">
      {(
        [
          { key: "Full name", value: profile.name, icon: UserRound },
          { key: "Email address", value: profile.email, icon: Mail },
          { key: "Time zone", value: profile.timezone, icon: Globe2 },
        ] as const
      ).map(({ key, value, icon: Icon }) => (
        <div key={key}>
          <dt>
            <Icon size={16} />
            {key}
          </dt>
          <dd>{value}</dd>
        </div>
      ))}
    </dl>
  );
  return (
    <div className="shell">
      <a className="skip" href="#content">
        Skip to content
      </a>
      <aside className="sidebar">
        <Sidebar view={view} profile={profile} />
      </aside>
      <div className="shell-main">
        <header className="topbar">
          <Dialog.Root open={drawer} onOpenChange={setDrawer}>
            <Dialog.Trigger asChild>
              <button
                type="button"
                className="menu-button"
                aria-label="Open navigation"
              >
                <PanelLeft size={21} />
              </button>
            </Dialog.Trigger>
            <Dialog.Portal>
              <Dialog.Overlay className="scrim" />
              <Dialog.Content
                aria-describedby={undefined}
                className="mobile-drawer"
              >
                <Dialog.Title className="sr-only">Navigation</Dialog.Title>
                <Dialog.Close className="close" aria-label="Close navigation">
                  <X size={20} />
                </Dialog.Close>
                <Sidebar
                  profile={profile}
                  view={view}
                  onNavigate={() => setDrawer(false)}
                />
              </Dialog.Content>
            </Dialog.Portal>
          </Dialog.Root>
          <span className="crumb">
            Personal <ChevronRight size={13} /> <b>{title}</b>
          </span>
          <button
            className="signout"
            type="button"
            onClick={signOut}
            disabled={busy}
          >
            <LogOut size={16} />
            {busy ? "Signing out…" : "Sign out"}
          </button>
        </header>
        <main id="content" className="dashboard" tabIndex={-1}>
          <h1>{title}</h1>
          {failure && (
            <p role="alert" className="notice">
              {failure}
            </p>
          )}
          {view === "overview" && (
            <section className="welcome">
              <div className="art-landscape" aria-hidden="true" />
              <div className="welcome-text">
                <h2>
                  Welcome back,
                  <br />
                  <em>{profile.name}.</em>
                </h2>
                <Button asChild className="hero-link">
                  <Link prefetch={false} href="/app/account">
                    View account <ArrowRight size={16} />
                  </Link>
                </Button>
              </div>
            </section>
          )}
          <section className="profile-card">
            <div className="card-header">
              <div className="icon-tile">
                <UserRound size={20} />
              </div>
              <h2>
                {view === "overview"
                  ? "Account at a glance"
                  : "Profile details"}
              </h2>
            </div>
            {info}
          </section>
          <div className="session-note">
            <ShieldCheck size={16} />
            <span>Signed in to TaskFlow</span>
          </div>
        </main>
      </div>
    </div>
  );
}
