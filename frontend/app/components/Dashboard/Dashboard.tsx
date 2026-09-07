"use client";

import Link from "next/link";
import {
  useEffect,
  useRef,
  useState,
} from "react";

import {
  QRCodeSVG,
} from "qrcode.react";

import styles from "./Dashboard.module.css";

type DashboardUser = {
  username: string;
  name?: string | null;
  surname?: string | null;
};

type DashboardStudy = {
  study_id: string;
  study_name: string;
};

type DashboardData = {
  surveys?: DashboardStudy[];
};

interface DashboardProps {
  user: DashboardUser;
  dashboardData: DashboardData;
}

const Dashboard: React.FC<
  DashboardProps
> = ({
  user,
  dashboardData,
}) => {
  const [
    deleteMessage,
    setDeleteMessage,
  ] = useState("");

  const [
    token,
    setToken,
  ] = useState<
    string | null
  >(null);

  const [
    studies,
    setStudies,
  ] = useState<
    DashboardStudy[]
  >([]);

  const [
    qrStudy,
    setQrStudy,
  ] = useState<
    DashboardStudy | null
  >(null);

  const [
    copyMessage,
    setCopyMessage,
  ] = useState("");

  const qrContainerRef =
    useRef<
      HTMLDivElement | null
    >(null);

  useEffect(() => {
    const storedToken =
      localStorage.getItem(
        "token"
      );

    if (storedToken) {
      setToken(storedToken);
    }
  }, []);

  useEffect(() => {
    if (
      Array.isArray(
        dashboardData?.surveys
      )
    ) {
      setStudies(
        dashboardData.surveys
      );
    }
  }, [dashboardData]);

  useEffect(() => {
    if (!qrStudy) {
      return;
    }

    function handleKeyDown(
      event: KeyboardEvent
    ) {
      if (
        event.key ===
        "Escape"
      ) {
        setQrStudy(null);
        setCopyMessage("");
      }
    }

    document.addEventListener(
      "keydown",
      handleKeyDown
    );

    const previousOverflow =
      document.body.style.overflow;

    document.body.style.overflow =
      "hidden";

    return () => {
      document.removeEventListener(
        "keydown",
        handleKeyDown
      );

      document.body.style.overflow =
        previousOverflow;
    };
  }, [qrStudy]);

  const handleDeleteStudy =
    async (
      studyId: string
    ) => {
      if (!token) {
        setDeleteMessage(
          "Authentication token not available."
        );
        return;
      }

      try {
        const response =
          await fetch(
            "/api/user/studies",
            {
              method: "DELETE",
              headers: {
                "Content-Type":
                  "application/json",
                Authorization:
                  `Bearer ${token}`,
              },
              body: JSON.stringify({
                study_id: studyId,
              }),
            }
          );

        if (!response.ok) {
          const errorData =
            await response
              .json()
              .catch(() => ({}));

          setDeleteMessage(
            typeof errorData.detail ===
              "string"
              ? errorData.detail
              : JSON.stringify(
                  errorData.detail ??
                    {}
                )
          );

          return;
        }

        setStudies(
          (current) =>
            current.filter(
              (study) =>
                study.study_id !==
                studyId
            )
        );

        if (
          qrStudy?.study_id ===
          studyId
        ) {
          setQrStudy(null);
        }

        setDeleteMessage(
          "Study removed."
        );
      } catch {
        setDeleteMessage(
          "Error removing study."
        );
      }
    };

  function openQr(
    study: DashboardStudy
  ) {
    setQrStudy(study);
    setCopyMessage("");
  }

  function closeQr() {
    setQrStudy(null);
    setCopyMessage("");
  }

  function getQrValue(
    studyId: string
  ) {
    return `/api/v2/studies/${studyId}`;
  }

  async function copyQrValue() {
    if (!qrStudy) {
      return;
    }

    const value =
      getQrValue(
        qrStudy.study_id
      );

    try {
      await navigator.clipboard.writeText(
        value
      );

      setCopyMessage(
        "Copied."
      );
    } catch {
      setCopyMessage(
        "Could not copy."
      );
    }
  }

  function downloadQr() {
    if (
      !qrStudy ||
      !qrContainerRef.current
    ) {
      return;
    }
  
    const svg =
      qrContainerRef.current.querySelector(
        "svg"
      );
  
    if (!svg) {
      return;
    }
  
    const serializer =
      new XMLSerializer();
  
    const source =
      serializer.serializeToString(
        svg
      );
  
    const svgBlob =
      new Blob(
        [source],
        {
          type: "image/svg+xml;charset=utf-8",
        }
      );
  
    const svgUrl =
      URL.createObjectURL(
        svgBlob
      );
  
    const image =
      new Image();
  
    image.onload = () => {
      const size = 1024;
  
      const canvas =
        document.createElement(
          "canvas"
        );
  
      canvas.width = size;
      canvas.height = size;
  
      const context =
        canvas.getContext(
          "2d"
        );
  
      if (!context) {
        URL.revokeObjectURL(
          svgUrl
        );
        return;
      }
  
      context.fillStyle =
        "#ffffff";
  
      context.fillRect(
        0,
        0,
        size,
        size
      );
  
      context.drawImage(
        image,
        0,
        0,
        size,
        size
      );
  
      const safeStudyId =
        qrStudy.study_id.replace(
          /[^a-zA-Z0-9_-]+/g,
          "_"
        );
  
      canvas.toBlob(
        (blob) => {
          if (!blob) {
            URL.revokeObjectURL(
              svgUrl
            );
            return;
          }
  
          const pngUrl =
            URL.createObjectURL(
              blob
            );
  
          const anchor =
            document.createElement(
              "a"
            );
  
          anchor.href =
            pngUrl;
  
          anchor.download =
            `${safeStudyId}_qr.png`;
  
          document.body.appendChild(
            anchor
          );
  
          anchor.click();
          anchor.remove();
  
          URL.revokeObjectURL(
            pngUrl
          );
  
          URL.revokeObjectURL(
            svgUrl
          );
        },
        "image/png"
      );
    };
  
    image.onerror = () => {
      URL.revokeObjectURL(
        svgUrl
      );
    };
  
    image.src = svgUrl;
  }

  const firstName =
    user.name?.trim() ||
    user.username;

  const qrValue =
    qrStudy
      ? getQrValue(
          qrStudy.study_id
        )
      : "";

  return (
    <main
      className={
        styles.page
      }
    >
      <header
        className={
          styles.pageHeader
        }
      >
        <div
          className={
            styles.intro
          }
        >
          <p
            className={
              styles.eyebrow
            }
          >
            Dashboard
          </p>

          <h1
            className={
              styles.title
            }
          >
            Hi, {firstName}
          </h1>

          <p
            className={
              styles.subtitle
            }
          >
            Here are your studies
            and collected data.
          </p>
        </div>

        <Link
          href="/retrieve-study"
          className={
            styles.addStudyButton
          }
        >
          <span
            className={
              styles.addSymbol
            }
            aria-hidden="true"
          >
            +
          </span>

          Add study
        </Link>
      </header>

      <section
        className={
          styles.studies
        }
      >
        <div
          className={
            styles.sectionHeader
          }
        >
          <div>
            <h2
              className={
                styles.sectionTitle
              }
            >
              Studies
            </h2>

            <p
              className={
                styles.sectionDescription
              }
            >
              Studies associated
              with your account
            </p>
          </div>

          <span
            className={
              styles.studyCount
            }
          >
            {studies.length}{" "}
            {studies.length ===
            1
              ? "study"
              : "studies"}
          </span>
        </div>

        {studies.length >
        0 ? (
          <div
            className={
              styles.studyList
            }
          >
            {studies.map(
              (study) => (
                <div
                  key={
                    study.study_id
                  }
                  className={
                    styles.studyRow
                  }
                >
                  <Link
                    href={`/study/${encodeURIComponent(
                      study.study_id
                    )}`}
                    className={
                      styles.studyLink
                    }
                  >
                    <span
                      className={
                        styles.studyMarker
                      }
                      aria-hidden="true"
                    />

                    <span
                      className={
                        styles.studyIdentity
                      }
                    >
                      <span
                        className={
                          styles.studyName
                        }
                      >
                        {
                          study.study_name
                        }
                      </span>

                      <span
                        className={
                          styles.studyId
                        }
                      >
                        {
                          study.study_id
                        }
                      </span>
                    </span>

                    <span
                      className={
                        styles.openStudy
                      }
                    >
                      Open
                      <span
                        aria-hidden="true"
                      >
                        →
                      </span>
                    </span>
                  </Link>

                  <div
                    className={
                      styles.studyActions
                    }
                  >
                    <button
                      type="button"
                      className={
                        styles.qrButton
                      }
                      onClick={() =>
                        openQr(
                          study
                        )
                      }
                      aria-label={`Show enrollment QR code for ${study.study_name}`}
                      title="Show QR code"
                    >
                      <svg
                        width="17"
                        height="17"
                        viewBox="0 0 24 24"
                        fill="none"
                        aria-hidden="true"
                      >
                        <path
                          d="M4 4h6v6H4V4Z"
                          stroke="currentColor"
                          strokeWidth="1.7"
                        />

                        <path
                          d="M14 4h6v6h-6V4Z"
                          stroke="currentColor"
                          strokeWidth="1.7"
                        />

                        <path
                          d="M4 14h6v6H4v-6Z"
                          stroke="currentColor"
                          strokeWidth="1.7"
                        />

                        <path
                          d="M14 14h2v2h-2v-2Z"
                          fill="currentColor"
                        />

                        <path
                          d="M18 14h2v2h-2v-2Z"
                          fill="currentColor"
                        />

                        <path
                          d="M14 18h2v2h-2v-2Z"
                          fill="currentColor"
                        />

                        <path
                          d="M18 18h2v2h-2v-2Z"
                          fill="currentColor"
                        />
                      </svg>

                      <span>
                        QR
                      </span>
                    </button>

                    <button
                      type="button"
                      className={
                        styles.deleteButton
                      }
                      onClick={() =>
                        void handleDeleteStudy(
                          study.study_id
                        )
                      }
                      aria-label={`Remove ${study.study_name}`}
                      title="Remove study"
                    >
                      ×
                    </button>
                  </div>
                </div>
              )
            )}
          </div>
        ) : (
          <div
            className={
              styles.emptyState
            }
          >
            <div
              className={
                styles.emptyMarker
              }
              aria-hidden="true"
            />

            <div>
              <p
                className={
                  styles.emptyTitle
                }
              >
                No studies yet
              </p>

              <p
                className={
                  styles.emptyDescription
                }
              >
                Add a study to
                begin exploring
                collected data.
              </p>
            </div>
          </div>
        )}

        {deleteMessage && (
          <p
            className={
              styles.deleteMessage
            }
          >
            {deleteMessage}
          </p>
        )}
      </section>

      {qrStudy && (
        <div
          className={
            styles.modalBackdrop
          }
          role="presentation"
          onMouseDown={(
            event
          ) => {
            if (
              event.target ===
              event.currentTarget
            ) {
              closeQr();
            }
          }}
        >
          <div
            className={
              styles.qrModal
            }
            role="dialog"
            aria-modal="true"
            aria-labelledby="qr-modal-title"
          >
            <div
              className={
                styles.qrModalHeader
              }
            >
              <div>
                <p
                  className={
                    styles.qrEyebrow
                  }
                >
                  Study enrollment
                </p>

                <h2
                  id="qr-modal-title"
                  className={
                    styles.qrTitle
                  }
                >
                  {
                    qrStudy.study_name
                  }
                </h2>

                <p
                  className={
                    styles.qrStudyId
                  }
                >
                  {
                    qrStudy.study_id
                  }
                </p>
              </div>

              <button
                type="button"
                className={
                  styles.modalCloseButton
                }
                onClick={
                  closeQr
                }
                aria-label="Close QR code"
              >
                ×
              </button>
            </div>

            <div
              className={
                styles.qrBody
              }
            >
              <div
                ref={
                  qrContainerRef
                }
                className={
                  styles.qrCode
                }
              >
                <QRCodeSVG
                  value={
                    qrValue
                  }
                  size={
                    240
                  }
                  level="M"
                  marginSize={
                    2
                  }
                  title={`Enrollment QR code for ${qrStudy.study_name}`}
                />
              </div>

              <p
                className={
                  styles.qrDescription
                }
              >
                Scan this code
                with the momenTUM
                mobile app to
                retrieve the
                study.
              </p>

              <div
                className={
                  styles.qrValueBlock
                }
              >
                <span
                  className={
                    styles.qrValueLabel
                  }
                >
                  QR value
                </span>

                <code
                  className={
                    styles.qrValue
                  }
                >
                  {
                    qrValue
                  }
                </code>
              </div>
            </div>

            <div
              className={
                styles.qrFooter
              }
            >
              <div
                className={
                  styles.copyArea
                }
              >
                <button
                  type="button"
                  className={
                    styles.secondaryButton
                  }
                  onClick={() =>
                    void copyQrValue()
                  }
                >
                  Copy value
                </button>

                {copyMessage && (
                  <span
                    className={
                      styles.copyMessage
                    }
                  >
                    {
                      copyMessage
                    }
                  </span>
                )}
              </div>

              <button
                type="button"
                className={
                  styles.downloadButton
                }
                onClick={
                  downloadQr
                }
              >
                Download PNG
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
};

export default Dashboard;