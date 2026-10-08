import Nav from "@/components/Nav";
import Hero from "@/components/Hero";
import TheIdea from "@/components/TheIdea";
import HowItLives from "@/components/HowItLives";
import NotThis from "@/components/NotThis";
import Faq from "@/components/Faq";
import GetTheApp from "@/components/GetTheApp";
import Footer from "@/components/Footer";
import "@/components/chapters.css";

export default function Home() {
  return (
    <>
      <Nav />
      <main>
        <Hero />
        <TheIdea />
        <HowItLives />
        <NotThis />
        <GetTheApp />
        <Faq />
      </main>
      <Footer />
    </>
  );
}
