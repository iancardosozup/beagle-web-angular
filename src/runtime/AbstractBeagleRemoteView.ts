/*
  * Copyright 2020 ZUP IT SERVICOS EM TECNOLOGIA E INOVACAO SA
  *
  * Licensed under the Apache License, Version 2.0 (the "License");
  * you may not use this file except in compliance with the License.
  * You may obtain a copy of the License at
  *
  *  http://www.apache.org/licenses/LICENSE-2.0
  *
  * Unless required by applicable law or agreed to in writing, software
  * distributed under the License is distributed on an "AS IS" BASIS,
  * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
  * See the License for the specific language governing permissions and
  * limitations under the License.
*/

import {
  AfterViewInit,
  OnDestroy,
  OnChanges,
  SimpleChanges,
  ChangeDetectorRef,
  NgZone,
  TemplateRef,
  Output,
  EventEmitter,
} from '@angular/core'
import {
  LoadParams,
  BeagleView,
  IdentifiableBeagleUIElement,
  RemoteView,
} from '@zup-it/beagle-web'
import { replaceToUnderline } from '../codegen/utils/formatting'
import { BeagleProvider } from './BeagleProvider.service'
import { createStaticPromise } from './utils/promise'
import BeagleRuntimeError from './errors'
import beagleMapKeysConfig from './utils/beagle-map-keys-config'

let nextViewId = 1

export abstract class AbstractBeagleRemoteView implements AfterViewInit, OnDestroy, OnChanges {
  // component input properties. todo: remove the loadParams with v2.0.
  route?: string | RemoteView
  controllerId?: string
  loadParams: Partial<LoadParams> = {}

  // class attributes
  tree: IdentifiableBeagleUIElement<any> | null
  view: BeagleView
  viewId = `${nextViewId++}`
  ngZone: NgZone
  changeDetector: ChangeDetectorRef
  viewStaticPromise = createStaticPromise<BeagleView>()

  @Output() onCreateBeagleView: EventEmitter<BeagleView> = new EventEmitter<BeagleView>()

  constructor(
    private beagleProvider: BeagleProvider,
    ngZone?: NgZone,
    changeDetector?: ChangeDetectorRef,
  ) {
    if (ngZone) this.ngZone = ngZone
    if (changeDetector) this.changeDetector = changeDetector
  }

  createBeagleView() {
    const beagleService = this.beagleProvider.getBeagleUIService()
    if (!beagleService) {
      throw new BeagleRuntimeError(
        'you need to start the beagle provider before using a remote view.',
      )
    }
    this.view = beagleService.createView(this.controllerId)
    this.view.subscribe(this.updateView)
    beagleService.viewContentManagerMap.register(`${this.viewId}`, this.view)
    this.viewStaticPromise.resolve(this.view)
    this.onCreateBeagleView.emit(this.view)
  }

  getTemplate(componentName: IdentifiableBeagleUIElement<any>['type']): TemplateRef<any> {
    const component = beagleMapKeysConfig.getComponent(componentName)
    const normalizedComponentName = replaceToUnderline(component)

    if (!this[normalizedComponentName]) {
      console.warn(
        `Beagle: the component ${componentName} was not declared in Beagle's configuration.`,
      )
    }
    return this[normalizedComponentName]
  }

  updateView = (uiTree: IdentifiableBeagleUIElement<any>) => {
    this.ngZone.run(() => {
      this.tree = uiTree && Object.keys(uiTree).length > 0 ? uiTree : null
      this.changeDetector.detectChanges()
    })
  }

  elementIdentity(index: number, element: IdentifiableBeagleUIElement<any>) {
    return element.id
  }

  getView() {
    return this.viewStaticPromise.promise
  }

  private loadFirstRoute() {
  
    if (this.route) {
      if (typeof this.route === 'string')
        {this.route = { url: this.route }}
      const navigator = this.view.getNavigator()
      if (navigator.isEmpty()) navigator.pushView(this.route)
      else navigator.resetStack(this.route, this.controllerId)
    }
  }

  ngAfterViewInit() {
    if (!this.beagleProvider || !this.ngZone || !this.changeDetector) {
      throw new BeagleRuntimeError(
        '"beagleProvider", "ngZone" and "changeDetector" must be set before the AfterViewInit runs. Use the constructor or the component instance to set their values.',
      )
    }
    this.createBeagleView()
    this.loadFirstRoute()
  }

  private hasAnyChanged(changes: SimpleChanges, properties: string[]) {
    return changes && !!properties.find(property => (
      changes[property]
      && changes[property].previousValue !== changes[property].currentValue
    ))
  }

  async ngOnChanges(changes: SimpleChanges) {
    if (this.view && this.hasAnyChanged(changes, ['loadParams', 'route'])) {
      this.loadFirstRoute()
    }
  }

  ngOnDestroy() {
    this.view.destroy()
    this.beagleProvider.getBeagleUIService()!.viewContentManagerMap.unregister(this.viewId)
  }
}
