import { useEffect, useRef, useState } from 'react';
import TopBar from './components/TopBar';
import Tabs from './components/Tabs';
import StepList from './components/StepList';
import StepTable from './components/StepTable';
import Splitter, { usePanelWidth } from './components/Splitter';
import DiagramPane from './components/DiagramPane';
import { useStore } from './store';
import { hydrateWorkspace, startAutosave } from './lib/workspace';

export default function App() {
  // one <svg> ref, shared by the diagram (writes it) and the exporter (reads it)
  const svgRef = useRef<SVGSVGElement>(null);
  const hydrated = useStore((s) => s.hydrated);
  // the spreadsheet view covers the workspace rather than replacing it, so the
  // diagram keeps its zoom and pan while you're away filling in columns
  const [table, setTable] = useState(false);
  usePanelWidth();

  useEffect(() => {
    void hydrateWorkspace().then(startAutosave);
  }, []);

  return (
    <div className="app">
      <TopBar svgRef={svgRef} onOpenTable={() => setTable(true)} />
      <Tabs />
      <div className="workspace">
        <StepList onOpenTable={() => setTable(true)} />
        <Splitter />
        <DiagramPane svgRef={svgRef} />
        {table && <StepTable onClose={() => setTable(false)} />}
      </div>
      {!hydrated && <div className="boot-veil" />}
    </div>
  );
}
