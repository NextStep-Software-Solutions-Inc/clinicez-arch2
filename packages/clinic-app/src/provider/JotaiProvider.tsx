import { Provider } from "jotai";
import { jotaiStore } from "../app/state/store";

export default function JotaiProvider({ children }: { children: React.ReactNode }) {
  return (
    <Provider store={jotaiStore}>
      {children}
    </Provider>
  );
}
