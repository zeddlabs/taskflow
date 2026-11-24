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
  UserRound,
  LogOut,
  X,
  ChevronRight,
  Mail,
  Globe2,
  Grid2X2,
} from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";
import { Brand } from "../../components/brand";
import { Button } from "../../components/ui/button";
import { readSessionHint, writeSessionHint } from "../auth/session-hint";
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
function Initials({ name }: { name: string }) {
  const words = name.trim().split(/\s+/u);
  const first = Array.from(words[0] ?? "")[0] ?? "";
  const last = words.length > 1 ? Array.from(words[words.length - 1])[0] : "";
  return (
    <span className="avatar" aria-hidden="true">
      {(first + last).toUpperCase()}
    </span>
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
      <nav aria-label="Main navigation">
        {(
          [
            {
              href: "/app",
              label: "Overview",
              key: "overview",
              icon: Grid2X2,
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
        <Initials name={profile.name} />
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
      writeSessionHint(null);
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
      const knownSession = query.data || readSessionHint() === "authenticated";
      writeSessionHint(knownSession ? "ended" : null);
      client.clear();
      window.location.replace("/login");
    } else if (query.data) {
      writeSessionHint("authenticated");
    }
  }, [expired, client, query.data]);
  async function signOut() {
    setBusy(true);
    setFailure("");
    try {
      await logout();
      writeSessionHint(null);
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
        <Brand />
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
                <div className="drawer-header">
                  <Brand />
                  <Dialog.Close className="close" aria-label="Close navigation">
                    <X size={20} />
                  </Dialog.Close>
                </div>
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
          <section className="identity-strip" aria-labelledby="identity-name">
            <Initials name={profile.name} />
            <div className="identity-copy">
              <h2 id="identity-name">{profile.name}</h2>
              <p className="session-note">Signed in to TaskFlow</p>
            </div>
          </section>
          <section className="profile-card" aria-labelledby="profile-title">
            <div className="card-header">
              <h2 id="profile-title">
                {view === "overview"
                  ? "Account at a glance"
                  : "Profile details"}
              </h2>
              {view === "overview" && (
                <Button asChild>
                  <Link prefetch={false} href="/app/account">
                    View account <ArrowRight size={16} aria-hidden="true" />
                  </Link>
                </Button>
              )}
            </div>
            {info}
          </section>
        </main>
      </div>
    </div>
  );
}
