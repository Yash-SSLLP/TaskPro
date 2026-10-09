/**
 * Where the page is: the sidebar row it belongs to (its icon, label and the
 * section it sits in). Layout provides it; PageHeader wears it, the way the
 * HRMS's page header wears its sidebar row.
 */
import { createContext, useContext } from 'react';

export const PlaceContext = createContext(null);
export const usePlace = () => useContext(PlaceContext);
