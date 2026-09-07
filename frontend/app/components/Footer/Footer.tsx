import styles from "./Footer.module.css";

export default function Footer() {
  return (
    <footer
      className={
        styles.footer
      }
    >
      <div
        className={
          styles.inner
        }
      >
        <p
          className={
            styles.description
          }
        >
          momenTUM · Open-source
          EMA research platform
        </p>

        <nav
          className={
            styles.links
          }
          aria-label="momenTUM resources"
        >
          <a
            href="https://momentumresearch.eu/"
            target="_blank"
            rel="noreferrer"
            className={
              styles.link
            }
          >
            Website
          </a>

          <a
            href="https://designer.momentumresearch.eu/"
            target="_blank"
            rel="noreferrer"
            className={
              styles.link
            }
          >
            Study Designer
          </a>

          <a
            href="https://momentumresearch.eu/participants.html"
            target="_blank"
            rel="noreferrer"
            className={
              styles.link
            }
          >
            Mobile app
          </a>
        </nav>
      </div>
    </footer>
  );
}