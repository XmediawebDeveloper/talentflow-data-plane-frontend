import { Header } from "@/components/marketing/Header";
import { Footer } from "@/components/marketing/Footer";
import { LandingPageContent } from "@/components/marketing/LandingPageContent";

export default function HomePage() {
  return (
    <>
      <Header />
      <main>
        <LandingPageContent />
      </main>
      <Footer />
    </>
  );
}
