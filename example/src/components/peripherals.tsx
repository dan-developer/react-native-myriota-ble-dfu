import React, { FC, useCallback } from 'react'
import {
  FlatList,
  ListRenderItemInfo,
  Modal,
  SafeAreaView,
  Text,
  StyleSheet,
  TouchableOpacity,
} from 'react-native'
import { Peripheral } from 'react-native-ble-manager'
import {} from '../modules/BLE'

type DeviceModalListItemProps = {
  item: ListRenderItemInfo<Peripheral>
  // connectToPeripheral: (device: Device) => void
  // closeModal: () => void
}

type DeviceModalProps = {
  devices: Peripheral[]
  // visible: boolean
  // connectToPeripheral: (device: Peripheral) => void
  // closeModal: () => void
}

const DeviceModalListItem: FC<DeviceModalListItemProps> = (props) => {
  // const { item, connectToPeripheral, closeModal } = props
  const { item } = props

  // const connectAndCloseModal = useCallback(() => {
  // connectToPeripheral(item.item)
  // closeModal()
  // }, [closeModal, connectToPeripheral, item.item])

  return (
    <TouchableOpacity
      // onPress={connectAndCloseModal}
      style={modalStyle.ctaButton}
    >
      <Text style={modalStyle.ctaButtonText}>{item.item.name}</Text>
    </TouchableOpacity>
  )
}

const DeviceModal: FC<DeviceModalProps> = (props) => {
  // const { devices, visible, connectToPeripheral, closeModal } = props
  const { devices } = props

  const renderDeviceModalListItem = useCallback(
    (item: ListRenderItemInfo<Peripheral>) => {
      return (
        <DeviceModalListItem
          item={item}
          // connectToPeripheral={connectToPeripheral}
          // closeModal={closeModal}
        />
      )
    },
    // [closeModal, connectToPeripheral]
    []
  )

  return (
    <Modal
      style={modalStyle.modalContainer}
      animationType='slide'
      transparent={false}
      visible={true}
    >
      <SafeAreaView style={modalStyle.modalTitle}>
        <Text style={modalStyle.modalTitleText}>
          Tap on a device to connect
        </Text>
        <FlatList
          contentContainerStyle={modalStyle.modalFlatlistContiner}
          data={devices}
          renderItem={renderDeviceModalListItem}
        />
      </SafeAreaView>
    </Modal>
  )
}

const modalStyle = StyleSheet.create({
  modalContainer: {
    flex: 1,
    backgroundColor: '#f2f2f2',
  },
  modalFlatlistContiner: {
    flex: 1,
    justifyContent: 'center',
  },
  modalCellOutline: {
    borderWidth: 1,
    borderColor: 'black',
    alignItems: 'center',
    marginHorizontal: 20,
    paddingVertical: 15,
    borderRadius: 8,
  },
  modalTitle: {
    flex: 1,
    backgroundColor: '#f2f2f2',
  },
  modalTitleText: {
    marginTop: 40,
    fontSize: 30,
    fontWeight: 'bold',
    marginHorizontal: 20,
    textAlign: 'center',
  },
  ctaButton: {
    backgroundColor: 'purple',
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

export default DeviceModal
