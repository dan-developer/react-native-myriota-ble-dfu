import React, { FC, useCallback } from 'react'
import {
  FlatList,
  ListRenderItemInfo,
  SafeAreaView,
  Text,
  StyleSheet,
  TouchableOpacity,
} from 'react-native'
import { Peripheral } from 'react-native-ble-manager'

type PeripheralViewListItemProps = {
  item: ListRenderItemInfo<Peripheral>
  connectToPeripheral: (peripheral: Peripheral) => void
}

type PeripheralViewProps = {
  devices: Peripheral[]
  scan: () => void
  connectToPeripheral: (device: Peripheral) => void
}

const PeripheralViewListItem: FC<PeripheralViewListItemProps> = (props) => {
  const { item, connectToPeripheral } = props

  const connect = useCallback(() => {
    connectToPeripheral(item.item)
  }, [connectToPeripheral, item.item])

  return (
    <TouchableOpacity onPress={connect} style={peripheralViewStyle.ctaButton}>
      <Text style={peripheralViewStyle.ctaButtonText}>{item.item.name}</Text>
    </TouchableOpacity>
  )
}

const PeripheralView: FC<PeripheralViewProps> = (props) => {
  const { devices, connectToPeripheral, scan } = props

  const renderPeripheralViewListItem = useCallback(
    (item: ListRenderItemInfo<Peripheral>) => {
      return (
        <PeripheralViewListItem
          item={item}
          connectToPeripheral={connectToPeripheral}
        />
      )
    },
    [connectToPeripheral]
  )

  return (
    <SafeAreaView style={peripheralViewStyle.peripheralViewTitle}>
      <TouchableOpacity style={peripheralViewStyle.ctaButton} onPress={scan}>
        <Text style={peripheralViewStyle.ctaButtonText}>Scan</Text>
      </TouchableOpacity>
      <Text style={peripheralViewStyle.peripheralViewTitleText}>
        Tap on a device to connect
      </Text>
      <FlatList
        contentContainerStyle={
          peripheralViewStyle.peripheralViewFlatlistContiner
        }
        data={devices}
        renderItem={renderPeripheralViewListItem}
      />
    </SafeAreaView>
  )
}

const peripheralViewStyle = StyleSheet.create({
  peripheralViewFlatlistContiner: {
    flex: 1,
    justifyContent: 'center',
  },
  peripheralViewCellOutline: {
    borderWidth: 1,
    borderColor: 'black',
    alignItems: 'center',
    marginHorizontal: 20,
    paddingVertical: 15,
    borderRadius: 8,
  },
  peripheralViewTitle: {
    flex: 1,
    backgroundColor: '#191d21',
  },
  peripheralViewTitleText: {
    marginTop: 40,
    fontSize: 30,
    fontWeight: 'bold',
    marginHorizontal: 20,
    textAlign: 'center',
    color: 'white',
  },
  ctaButton: {
    backgroundColor: '#fa0',
    justifyContent: 'center',
    alignItems: 'center',
    height: 50,
    marginHorizontal: 20,
    marginBottom: 5,
    borderRadius: 8,
  },
  ctaButtonText: {
    fontSize: 18,
    fontWeight: 'bold',
    color: 'white',
  },
})

export default PeripheralView
