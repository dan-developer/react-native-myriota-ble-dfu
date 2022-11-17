//
//  RNMyriotaBLEDFUModule.swift
//  RNMyriotaBLEDFUModule
//
//  Copyright © 2022 Robson Oliveira dos Santos. All rights reserved.
//

import Foundation

@objc(RNMyriotaBLEDFUModule)
class RNMyriotaBLEDFUModule: NSObject {
  @objc
  func constantsToExport() -> [AnyHashable : Any]! {
    return ["count": 1]
  }

  @objc
  static func requiresMainQueueSetup() -> Bool {
    return true
  }
}
