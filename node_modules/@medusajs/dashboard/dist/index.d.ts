declare function App(props: {
  plugins?: any[]
}): JSX.Element

export default App

import type enTranslation from "./en.json"
export type Resources = {
  translation: typeof enTranslation
}