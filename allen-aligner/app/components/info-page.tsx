import Link from "next/link";
export default function InfoPage({ eyebrow, title, intro, children }: { eyebrow: string; title: string; intro: string; children: React.ReactNode }) {
 return <main><section className="page-hero"><div className="container"><nav className="breadcrumb" aria-label="Breadcrumb"><Link href="/">Home</Link><span aria-hidden="true"> / </span><span aria-current="page">{eyebrow}</span></nav><span className="eyebrow">{eyebrow}</span><h1>{title}</h1><p className="lead">{intro}</p></div></section><section className="section container content-section">{children}</section></main>;
}
