"use client";

import CameraRig from "./CameraRig";
import CoreNode from "./CoreNode";
import ParticleUniverse from "./ParticleUniverse";
import YearMarkers from "./YearMarkers";
import YearStoryCards from "./YearStoryCards";
import StatCards from "./StatCards";
import TenText from "./TenText";
import FlyingCharacter from "./FlyingCharacter";

export default function Scene() {
  return (
    <>
      <CameraRig />
      <CoreNode />
      <ParticleUniverse />
      <YearMarkers />
      <YearStoryCards />
      <StatCards />
      <TenText />
      <FlyingCharacter />
    </>
  );
}
