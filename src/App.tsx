import { useState, useEffect, useCallback } from "react";
import Sidebar from "@/components/Sidebar";
import NoteList from "@/components/NoteList";
import Editor from "@/components/Editor";
import { initApp, listNotes, createNote } from "@/api";
import type { Note, NavItem } from "@/types";

function App() {
  const [notes, setNotes] = useState<Note[]>([]);
  const [selectedNote, setSelectedNote] = useState<Note | null>(null);
  const [activeNav, setActiveNav] = useState<NavItem>("all");
  const [isLoading, setIsLoading] = useState(true);

  const loadNotes = useCallback(async (filter?: string) => {
    const currentFilter = filter || activeNav;
    setIsLoading(true);
    try {
      const response = await listNotes(currentFilter);
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

  const handleNoteSelect = useCallback((note: Note) => {
    setSelectedNote(note);
  }, []);

  const handleNoteCreated = useCallback(async () => {
    try {
      const response = await createNote();
      if (response.success && response.data) {
        await loadNotes();
        setSelectedNote(response.data);
      }
    } catch (error) {
      console.error("Failed to create note:", error);
    }
  }, [loadNotes]);

  const handleNoteUpdated = useCallback(() => {
    loadNotes();
  }, [loadNotes]);

  const handleNoteDeleted = useCallback(() => {
    setSelectedNote(null);
    loadNotes();
  }, [loadNotes]);

  return (
    <div className="flex h-full bg-slate-50">
      <Sidebar 
        activeNav={activeNav} 
        onNavChange={setActiveNav}
        onNewNote={handleNoteCreated}
      />
      <NoteList 
        notes={notes}
        selectedNote={selectedNote}
        onSelect={handleNoteSelect}
        isLoading={isLoading}
        activeNav={activeNav}
      />
      <Editor 
        note={selectedNote}
        onNoteUpdated={handleNoteUpdated}
        onNoteDeleted={handleNoteDeleted}
      />
    </div>
  );
}

export default App;