import { useState, useEffect, useCallback } from "react";
import Sidebar from "@/components/Sidebar";
import NoteList from "@/components/NoteList";
import Editor from "@/components/Editor";
import { initApp, listNotes } from "@/api";
import type { Note, NavItem } from "@/types";

function App() {
  const [notes, setNotes] = useState<Note[]>([]);
  const [selectedNote, setSelectedNote] = useState<Note | null>(null);
  const [activeNav, setActiveNav] = useState<NavItem>("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [isLoading, setIsLoading] = useState(true);

  const loadNotes = useCallback(async (filter: string = activeNav) => {
    setIsLoading(true);
    try {
      const response = await listNotes(filter);
      if (response.success && response.data) {
        setNotes(response.data);
      }
    } catch (error) {
      console.error("Failed to load notes:", error);
    } finally {
      setIsLoading(false);
    }
  }, [activeNav]);

  useEffect(() => {
    const initialize = async () => {
      try {
        await initApp();
        await loadNotes();
      } catch (error) {
        console.error("Initialization failed:", error);
      }
    };
    initialize();
  }, [loadNotes]);

  useEffect(() => {
    loadNotes();
  }, [activeNav, loadNotes]);

  const handleNoteSelect = (note: Note) => {
    setSelectedNote(note);
  };

  const handleNoteCreated = () => {
    loadNotes();
  };

  const handleNoteUpdated = () => {
    loadNotes();
  };

  const handleNoteDeleted = () => {
    setSelectedNote(null);
    loadNotes();
  };

  const handleSearch = (query: string) => {
    setSearchQuery(query);
  };

  return (
    <div className="flex h-full bg-slate-50">
      <Sidebar 
        activeNav={activeNav} 
        onNavChange={setActiveNav}
        onSearch={handleSearch}
      />
      <NoteList 
        notes={notes}
        selectedNote={selectedNote}
        onSelect={handleNoteSelect}
        isLoading={isLoading}
        searchQuery={searchQuery}
      />
      <Editor 
        note={selectedNote}
        onNoteUpdated={handleNoteUpdated}
        onNoteCreated={handleNoteCreated}
        onNoteDeleted={handleNoteDeleted}
      />
    </div>
  );
}

export default App;