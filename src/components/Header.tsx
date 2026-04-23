import Link from "next/link";
import styles from "./Header.module.css";

export default function Header() {
	return (
		<>
			<header className={styles.header}>
				<div className={styles.headerWrap}>
					<div className={styles.logo}>
						<div className={styles.logoImg} />
						<div className={styles.logoText}>Next Music</div>
					</div>
					<nav className={styles.nav}>
						<Link href="/">Home</Link>
						<Link href="/store">Store</Link>
						<Link href="/fckcensor-next">FckCensor Next</Link>
					</nav>
				</div>
			</header>
			<div id="mini-player-slot" />
		</>
	);
}
