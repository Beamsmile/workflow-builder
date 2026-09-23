import { useEffect, useRef } from 'react';
import TopBar from './components/TopBar';
import Tabs from './components/Tabs';
import StepList from './components/StepList';
import Splitter, { usePanelWidth } from './components/Splitter';
import DiagramPane from './components/DiagramPane';
import { useStore } from './store';
import { hydrateWorkspace, startAutosave } from './lib/workspace';

export default function App() {
  // one <svg> ref, shared by the diagram (writes it) and the exporter (reads it)
  const svgRef = useRef<SVGSVGElement>(null);
  const hydrated = useStore((s) => s.hydrated);
  usePanelWidth();

  useEffect(() => {
    void hydrateWorkspace().then(startAutosave);
  }, []);

  return (
    <div className="app">
      <TopBar svgRef={svgRef} />
      <Tabs />
      <div className="workspace">
        <StepList />
        <Splitter />
        <DiagramPane svgRef={svgRef} />
      </div>
      {!hydrated && <div className="boot-veil" />}
    </div>
  );
}
