import React, { useEffect } from 'react'
import RNMyriotaBLEDFUModule, { Counter } from 'react-native-myriota-ble-dfu'

const App = () => {
  useEffect(() => {
    console.log(RNMyriotaBLEDFUModule)
  })

  return <Counter />
}

export default App
