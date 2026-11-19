'use client';

import { createContext, useContext, useState, ReactNode } from 'react';

type ModalState = {
  [key: string]: boolean;
};

interface ModalContextType {
  modals: ModalState;
  openModal: (modalId: string) => void;
  closeModal: (modalId: string) => void;
  toggleModal: (modalId: string) => void;
  isOpen: (modalId: string) => boolean;
}

const ModalContext = createContext<ModalContextType | undefined>(undefined);

export function ModalProvider({ children }: { children: ReactNode }) {
  const [modals, setModals] = useState<ModalState>({});

  const openModal = (modalId: string) => {
    setModals((prev) => ({ ...prev, [modalId]: true }));
  };

  const closeModal = (modalId: string) => {
    setModals((prev) => ({ ...prev, [modalId]: false }));
  };

  const toggleModal = (modalId: string) => {
    setModals((prev) => ({ ...prev, [modalId]: !prev[modalId] }));
  };

  const isOpen = (modalId: string) => {
    return modals[modalId] || false;
  };

  return (
    <ModalContext.Provider
      value={{ modals, openModal, closeModal, toggleModal, isOpen }}
    >
      {children}
    </ModalContext.Provider>
  );
}

export function useModal() {
  const context = useContext(ModalContext);
  if (context === undefined) {
    throw new Error('useModal must be used within a ModalProvider');
  }
  return context;
}
