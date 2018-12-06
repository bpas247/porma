import {createElement, isValidElement, Children, cloneElement, Component} from 'react'
import isEqual from 'react-fast-compare'
import pt from 'prop-types'

import STATUS from './status'
import {empty} from './utils'

class Porma extends Component {
  /**
   * [STATIC METHODS]
   **/
  static propTypes = {
    initialValues: pt.object,
    onSubmit: pt.func.isRequired,
    validations: pt.object,
    validateOnSubmit: pt.bool,
    resetOnPropChanges: pt.bool
  }

  static defaultProps = {
    initialValues: {},
    validateOnSubmit: true,
    resetOnPropChanges: false,
    validations: {}
  }

  /**
   * [UTILITY METHODS]
   **/
  modifyPormaChildren = children =>
    Children.map(children, child => {
      if (!isValidElement(child)) return child

      if ('name' in child.props) {
        const fieldNotInitialized = !(child.props.name in this.state.data)
        if (fieldNotInitialized) {
          this.unRegisteredFields[child.props.name] =
            child.props.name in this.state.data
              ? this.state.data[child.props.name]
              : child.props.type === 'checkbox'
              ? false
              : ''
        }
        return this.childAsField(child)
      }

      if ('data-porma' in child.props && typeof child.type === 'function') {
        return this.childAsPormaDataReceiver(child)
      }

      return child
    })

  childAsField = child => {
    const {name, onChange} = child.props

    let fieldChangeHandler = null
    if (typeof onChange === 'function') {
      fieldChangeHandler = this.modifiedOnChangeFieldHandler(name, onChange)
    } else {
      fieldChangeHandler = this.defaultFieldChangeHandler(name)
    }

    let fieldProps = {}
    if (typeof child.type === 'function') {
      const requiresValidation = name in this.props.validations
      const {valid, hints} = this.state.validations[name] || {
        valid: null,
        hints: null
      }
      fieldProps = {
        field: {
          requiresValidation,
          valid,
          hints,
          status: valid === null ? '' : valid ? 'success' : 'error'
        }
      }
    }

    const props = {
      ...child.props,
      ...fieldProps,
      value: this.getValue(name),
      checked: child.props.type === 'checkbox' ? this.getValue(name) : null,
      onChange: fieldChangeHandler
    }
    return cloneElement(child, props)
  }

  childAsPormaDataReceiver = child => {
    const props = {
      ...child.props,
      form: this.state,
      actions: this.getActions()
    }
    return cloneElement(child, props)
  }

  getValue = fieldName => {
    let value = null

    if (fieldName in this.state.data) {
      value = this.state.data[fieldName]
    }

    if (
      !(fieldName in this.state.data) &&
      fieldName in this.unRegisteredFields
    ) {
      value = this.unRegisteredFields[fieldName]
    }

    return value
  }

  defaultFieldChangeHandler = fieldName => e => {
    let fieldData =
      e.target.type === 'checkbox' ? e.target.checked : e.target.value

    const updateFieldData = this.setData(fieldName, fieldData)
    const validateFieldData = this.validateField(fieldName, fieldData)
    this.setState(updateFieldData, validateFieldData)
  }

  modifiedOnChangeFieldHandler = (fieldName, onChangeCb) => (
    ...fieldParams
  ) => {
    const fieldData = onChangeCb(...fieldParams)
    const updateFieldData = this.setData(fieldName, fieldData)
    const validateFieldData = this.validateField(fieldName, fieldData)
    this.setState(updateFieldData, validateFieldData)
  }

  setData = (fieldName, fieldData) => ps => {
    return {
      ...ps,
      data: {
        ...ps.data,
        [fieldName]: fieldData
      }
    }
  }

  validateField = (fieldName, fieldData) => () => {
    const {validations} = this.props

    if (!(fieldName in validations)) {
      // NO-OP if the field has no given validation function.
      return null
    }

    const validation = validations[fieldName](fieldData)
    const validate = Promise.resolve(validation)
    const updateFieldValidations = this.setValidation(fieldName)
    validate.then(updateFieldValidations).catch(updateFieldValidations)
  }

  setValidation = fieldName => validation => {
    const [valid, hints] = validation
    this.setState(ps => ({
      ...ps,
      validations: {
        ...ps.validations,
        [fieldName]: {valid, hints}
      }
    }))
  }

  handleSubmit = e => {
    e.preventDefault()
    e.stopPropagation()
    const {validateOnSubmit} = this.props
    if (validateOnSubmit) {
      const validations = Object.keys(this.state.data)
        .filter(fieldName => fieldName in this.props.validations)
        .map(fieldName => {
          const {validations} = this.props
          const fieldData = this.state.data[fieldName]
          const validation = validations[fieldName](fieldData)
          return Promise.resolve(validation)
            .then(validation => ({
              valid: validation[0],
              hints: validation[1],
              fieldName
            }))
            .catch(validation => ({
              valid: validation[0],
              hints: validation[1],
              fieldName
            }))
        })

      Promise.all(validations)
        .then(this.validateAndSubmit)
        .catch(this.validateAndSubmit)
    } else {
      this.submit()
    }
  }

  validateAndSubmit = results => {
    const validations = results
      .filter(validation => !validation.valid)
      .reduce((validations, validation) => {
        const {fieldName, ...result} = validation
        return {
          ...validations,
          [fieldName]: result
        }
      }, {})

    this.setState(
      ps => ({
        ...ps,
        fieldErrors: Object.keys(validations).length,
        validations: {
          ...ps.validations,
          ...validations
        }
      }),
      this.submit
    )
  }

  submit = () => {
    const {onSubmit} = this.props
    onSubmit(this.state, this.getActions())
  }

  getActions = () => {
    return {
      setSubmitting: this.setSubmitting,
      setDone: this.setDone,
      setSuccess: this.setSuccess,
      setFailed: this.setFailed
    }
  }

  setSubmitting = (statusMessage = '') => {
    this.setState({
      status: STATUS.submitting,
      statusMessage
    })
  }

  setDone = (statusMessage = '', resetValues = {}) => {
    this.setState({
      ...this.resetForm(resetValues),
      status: '',
      statusMessage
    })
  }

  setSuccess = (statusMessage = '', resetValues = {}) => {
    this.setState({
      ...this.resetForm(resetValues),
      status: STATUS.success,
      statusMessage
    })
  }

  setFailed = (statusMessage = '', resetValues = {}) => {
    this.setState({
      ...this.resetForm(resetValues),
      status: STATUS.failed,
      statusMessage
    })
  }

  resetForm = values => {
    return {
      status: '',
      statusMessage: '',
      fieldErrors: 0,
      data: {
        ...this.unRegisteredFields,
        ...values
      },
      validations: {}
    }
  }

  getPormaProps = props => {
    const {initialValues, validations, validateOnSubmit} = props
    return {initialValues, validations, validateOnSubmit}
  }

  registerUnregisteredFields = () => {
    if (!empty(this.unRegisteredFields)) {
      this.setState(ps => ({
        ...ps,
        data: {
          ...ps.data,
          ...this.unRegisteredFields
        }
      }))
    }
  }

  /**
   * [LIFECYCLE METHODS]
   **/
  constructor(props) {
    super(props)
    this.state = {
      status: '',
      statusMessage: '',
      fieldErrors: 0,
      data: this.props.initialValues,
      validations: {}
    }
  }

  componentDidMount() {
    this.registerUnregisteredFields()
  }

  componentDidUpdate(prevProps) {
    const {resetOnPropChanges, initialValues} = this.props
    const pormaPropsChanged = !isEqual(
      this.getPormaProps(this.props),
      this.getPormaProps(prevProps)
    )
    if (resetOnPropChanges && pormaPropsChanged) {
      this.setState(
        this.resetForm(initialValues),
        this.registerUnregisteredFields
      )
    }
  }

  shouldComponentUpdate(nextProps, nextState) {
    const propsChanged = !isEqual(this.props, nextProps)
    const stateChanged = !isEqual(this.state, nextState)
    return propsChanged || stateChanged
  }

  render() {
    const {
      children,
      initialValues,
      validations,
      validateOnSubmit,
      resetOnPropChanges,
      ...form
    } = this.props

    // Set unregistered fields everytime Porma re-renders
    this.unRegisteredFields = {}
    const modifiedChildren = this.modifyPormaChildren(children)

    return createElement(
      'form',
      {...form, onSubmit: this.handleSubmit},
      modifiedChildren
    )
  }
}

export default Porma
