import { createContext, useContext, useEffect, useState } from 'react';
import { api } from '../api/client';

const ProjectContext = createContext(null);

export function ProjectProvider({ children }) {
  const [projects, setProjects] = useState([]);
  const [selectedId, setSelectedId] = useState(localStorage.getItem('jobscheduler_project') || '');
  const [loading, setLoading] = useState(true);

  async function refresh() {
    setLoading(true);
    const { data } = await api.listProjects();
    setProjects(data);
    if (!selectedId && data.length > 0) select(data[0].id);
    setLoading(false);
  }

  function select(id) {
    setSelectedId(id);
    localStorage.setItem('jobscheduler_project', id);
  }

  useEffect(() => { refresh(); }, []);

  const selected = projects.find(p => p.id === selectedId) || null;

  return (
    <ProjectContext.Provider value={{ projects, selected, selectedId, select, refresh, loading }}>
      {children}
    </ProjectContext.Provider>
  );
}

export function useProject() {
  return useContext(ProjectContext);
}
