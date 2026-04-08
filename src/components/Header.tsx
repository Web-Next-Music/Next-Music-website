import Link from "next/link";
import styles from "./Header.module.css";

export default function Header() {
    return (
        <header className={styles.header}>
            <div className={styles.logo}>
                <div className={styles.logoImg} />
                Next Music
            </div>
            <nav className={styles.nav}>
                <Link href="/">Home</Link>
                <Link href="/fckcensor-next">FckCensor Next</Link>
            </nav>
        </header>
    );
}
