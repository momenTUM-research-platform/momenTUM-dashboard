"use client";

import Image from "next/image";
import Link from "next/link";
import {
  usePathname,
  useRouter,
} from "next/navigation";
import {
  useEffect,
  useState,
} from "react";

import { useAuth } from "../../context/AuthContext";

import styles from "./Header.module.css";

export default function Header() {
  const {
    user,
    logout,
  } = useAuth();

  const router =
    useRouter();

  const pathname =
    usePathname();

  const [
    mounted,
    setMounted,
  ] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  const handleLogout = () => {
    logout();
    router.push("/login");
  };

  if (!mounted) {
    return null;
  }

  const displayName =
    [
      user?.name,
      user?.surname,
    ]
      .filter(Boolean)
      .join(" ") ||
    user?.username ||
    "";

  const dashboardActive =
    pathname === "/" ||
    pathname.startsWith(
      "/study/",
    ) ||
    pathname.startsWith(
      "/retrieve-study",
    );

  const adminActive =
    pathname.startsWith(
      "/admin",
    );

  return (
    <header
      className={
        styles.header
      }
    >
      <div
        className={
          styles.inner
        }
      >
        <div
          className={
            styles.left
          }
        >
          <Link
            href="/"
            className={
              styles.brand
            }
          >
            <Image
              src="/icon.png"
              alt=""
              width={32}
              height={32}
              priority
              className={
                styles.logo
              }
            />

            <span
              className={
                styles.brandText
              }
            >
              <span
                className={
                  styles.brandName
                }
              >
                momenTUM
              </span>

              <span
                className={
                  styles.brandSubtitle
                }
              >
                Research dashboard
              </span>
            </span>
          </Link>

          {user && (
            <nav
              className={
                styles.nav
              }
              aria-label="Main navigation"
            >
              <Link
                href="/"
                className={`${styles.navLink} ${
                  dashboardActive
                    ? styles.navLinkActive
                    : ""
                }`}
              >
                Dashboard
              </Link>

              {user.role ===
                "admin" && (
                <Link
                  href="/admin"
                  className={`${styles.navLink} ${
                    adminActive
                      ? styles.navLinkActive
                      : ""
                  }`}
                >
                  Admin
                </Link>
              )}
            </nav>
          )}
        </div>

        <div
          className={
            styles.userControls
          }
        >
          {user ? (
            <>
              <div
                className={
                  styles.userIdentity
                }
              >
                <span
                  className={
                    styles.userName
                  }
                >
                  {displayName}
                </span>

                <span
                  className={
                    styles.userRole
                  }
                >
                  {user.role ===
                  "admin"
                    ? "Administrator"
                    : "Researcher"}
                </span>
              </div>

              <button
                type="button"
                className={
                  styles.logoutButton
                }
                onClick={
                  handleLogout
                }
              >
                Log out
              </button>
            </>
          ) : (
            <Link
              href="/login"
              className={
                styles.loginLink
              }
            >
              Log in
            </Link>
          )}
        </div>
      </div>
    </header>
  );
}