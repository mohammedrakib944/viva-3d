"use client";

import CameraRig from "./CameraRig";
import ParticleUniverse from "./ParticleUniverse";
import YearMarkers from "./YearMarkers";
import YearStoryCards from "./YearStoryCards";
import StatCards from "./StatCards";
import LogoFinale from "./LogoFinale";
import FlyingCharacter from "./FlyingCharacter";

export default function Scene() {
  return (
    <>
      <CameraRig />
      <ParticleUniverse />
      <YearMarkers />
      <YearStoryCards />
      <StatCards />
      <LogoFinale />
      <FlyingCharacter />
    </>
  );
}
