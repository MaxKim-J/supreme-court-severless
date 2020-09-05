const precedentTypeFilter = (type) => {
  if ('가나다라마바사아자차카타파하'.includes(type)) {
    return 'civil'
  } else if ('고노도로모보소오조초코토포호'.includes(type)) {
    return 'criminal'
  } else if ('그느드르므브스으즈츠크트프흐'.includes(type)) {
    return 'domestic'
  } else if ('구누두루무부수우주추쿠투푸후'.includes(type)) {
    return 'administration'
  } else {
    return 'unclassified'
  }
}

module.exports = precedentTypeFilter
