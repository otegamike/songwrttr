"use client";
import dynamic from "next/dynamic";
const LandingDemo = dynamic(() => import("./LandingDemo").then((module) => module.LandingDemo), { ssr: false, loading: () => <div aria-label="Loading demo">Loading the interactive preview…</div> });
export function LandingDemoLoader() { return <LandingDemo/>; }
